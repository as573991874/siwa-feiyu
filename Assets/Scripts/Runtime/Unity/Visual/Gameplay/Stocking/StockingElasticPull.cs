using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace XXD.Visual.Unity {
    public sealed class StockingElasticPull : MonoBehaviour {
        public SkinnedMeshRenderer source;
        public Material shellMaterial;
        public Material skinMaterial;
        public float MaxSeparation { get; private set; }
        public float GrabSeparation { get; private set; }
        public bool IsGripped { get; private set; }
        public bool IsVisible {get;private set;}
        public bool useHandAnchor;
        public Vector3 handAnchorWorld;
        public float HandContactError {get;private set;}
        private float preparedTime=-1;
        
        private const int Columns = 49;
        private const int UniqueColumns = 48;
        private const float Step = 1f / 120f;
        private Mesh shellMesh;
        private Mesh skinMesh;
        private GameObject shellObject;
        private GameObject skinObject;
        private GameObject gripObject;
        private LineRenderer guide;
        private Material material;
        private Vector3[] rest;
        private Vector3[] positions;
        private Vector3[] normals;
        private Vector2[] uv;
        private Vector2[] patternUV;
        private Color[] strains;
        private Vector3[] previous;
        private float[] inverseMass;
        private bool[] mobile;
        private bool[] pins;
        private int rows;
        private int gripIndex;
        private int chapter = -1;
        private float clock;
        private bool initialized;
        private struct Edge { public int a,b; public float length,compliance; }
        private readonly List<Edge> edges = new List<Edge>();
        private Vector3 pullDirection = new Vector3(-.8f,0,.6f);

        private GameObject Node(string name) {
            var node = new GameObject(name);
            node.transform.SetParent(source.transform, false);
            node.hideFlags = HideFlags.DontSave;
            return node;
        }

        private void Initialize() {
            if (initialized) return;
            initialized = true;
            skinMesh = new Mesh { name = "UnmovingSkin", hideFlags = HideFlags.DontSave };
            source.BakeMesh(skinMesh);
            skinObject = Node("UnderlyingSkin");
            (skinObject.AddComponent(typeof(MeshFilter)) as MeshFilter).sharedMesh = skinMesh;
            (skinObject.AddComponent(typeof(MeshRenderer)) as MeshRenderer).sharedMaterial = skinMaterial;
            var dense = skinMesh.vertices;
            var denseNormals = skinMesh.normals;
            var denseUV = source.sharedMesh.uv;
            var densePatternUV=source.sharedMesh.uv2;
            int denseRows = dense.Length / 97;
            rows = (denseRows - 1) / 2 + 1;
            int count = rows * Columns;
            rest = new Vector3[count]; positions = new Vector3[count]; normals = new Vector3[count];
            uv = new Vector2[count];patternUV=new Vector2[count]; strains = new Color[count];previous=new Vector3[count];inverseMass=new float[count];mobile = new bool[count];pins = new bool[count];
            for (int r=0;r<rows;r++) for (int c=0;c<Columns;c++) {
                int i=r*Columns+c;int original=Mathf.Min(r*2,denseRows-1)*97+c*2;
                rest[i]=dense[original];normals[i]=denseNormals[original].normalized;positions[i]=rest[i]+normals[i]*.0025f;uv[i]=denseUV[original];patternUV[i]=densePatternUV[original];strains[i]=Color.white;
            }
            for(int r=0;r<rows;r++)for(int c=0;c<UniqueColumns;c++) {
                int i=r*Columns+c;
                AddEdge(i,i+1,.000025f);
                if(r+1<rows) { AddEdge(i,i+Columns,.000018f);AddEdge(i,i+Columns+1,.00009f);if(c>0)AddEdge(i,i+Columns-1,.00009f); }
                if(r+2<rows)AddEdge(i,i+2*Columns,.003f);
                if(c+2<Columns)AddEdge(i,i+2,.003f);
            }
            var triangles=new int[(rows-1)*UniqueColumns*6];int at=0;
            for(int r=0;r<rows-1;r++)for(int c=0;c<UniqueColumns;c++) {
                int i=r*Columns+c,n=i+Columns;
                triangles[at++]=i;triangles[at++]=i+1;triangles[at++]=n;triangles[at++]=i+1;triangles[at++]=n+1;triangles[at++]=n;
            }
            shellMesh=new Mesh {name="ElasticStockingSurface",hideFlags=HideFlags.DontSave};shellMesh.MarkDynamic();shellMesh.vertices=positions;shellMesh.uv=uv;shellMesh.uv2=patternUV;shellMesh.colors=strains;shellMesh.triangles=triangles;shellMesh.RecalculateNormals();shellMesh.RecalculateTangents();
            shellObject=Node("ElasticStockingShell");(shellObject.AddComponent(typeof(MeshFilter)) as MeshFilter).sharedMesh=shellMesh;
            material=new Material(shellMaterial){hideFlags=HideFlags.DontSave};var renderer=shellObject.AddComponent(typeof(MeshRenderer)) as MeshRenderer;renderer.sharedMaterial=material;renderer.shadowCastingMode=ShadowCastingMode.Off;
            gripObject=GameObject.CreatePrimitive(PrimitiveType.Sphere);gripObject.name="MouseGrabPoint";gripObject.transform.SetParent(source.transform,false);gripObject.transform.localScale=Vector3.one*.018f;gripObject.hideFlags=HideFlags.DontSave;
            var collider=gripObject.GetComponent(typeof(Collider));if(collider!=null)DestroyImmediate(collider);
            var gripMaterial=new Material(Shader.Find("Universal Render Pipeline/Unlit")){hideFlags=HideFlags.DontSave};gripMaterial.color=new Color(1,.59f,.12f);gripObject.GetComponent<Renderer>().sharedMaterial=gripMaterial;
            var lineObject=Node("PullDistanceGuide");guide=lineObject.AddComponent(typeof(LineRenderer)) as LineRenderer;guide.sharedMaterial=gripMaterial;guide.positionCount=2;guide.startWidth=.0015f;guide.endWidth=.0015f;guide.useWorldSpace=true;
        }

        private void AddEdge(int a,int b,float compliance) {
            edges.Add(new Edge{a=a,b=b,length=Vector3.Distance(rest[a],rest[b]),compliance=compliance});
        }

        private void ResetPatch(int nextChapter,float start) {
            chapter=nextChapter;clock=start;
            float height=chapter==7?.54f:1.02f;
            var target=new Vector3(-.27f,height,.025f);float closest=float.PositiveInfinity;
            for(int i=0;i<rest.Length;i++) {
                positions[i]=rest[i]+normals[i]*.0025f;previous[i]=positions[i];
                float distance=Mathf.Pow(uv[i].y-height,2)+Mathf.Pow((i%Columns)-UniqueColumns/2,2)*.0005f;if(distance<closest){closest=distance;gripIndex=i;}
            }
            for(int i=0;i<rest.Length;i++) {
                Vector3 delta=rest[i]-rest[gripIndex];
                float distance=Mathf.Sqrt(delta.x*delta.x+delta.z*delta.z+delta.y*delta.y*.7f);
                mobile[i]=distance<.27f && Vector3.Dot(normals[i],pullDirection)>.03f;
                pins[i]=distance<.022f;
            }
        }

        private void Integrate(float time) {
            float local=time-chapter*8;
            IsGripped=local>=1.5f && local<4.6f;
            float maximum=chapter==7?.10f:.14f;
            float amplitude=maximum*GarmentCharacterMotion.Ease(Mathf.InverseLerp(1.5f,3.0f,local));
            Vector3 gripDelta=pullDirection*amplitude+Vector3.up*(amplitude*.10f);
            if(useHandAnchor)gripDelta=source.transform.InverseTransformPoint(handAnchorWorld)-rest[gripIndex]-normals[gripIndex]*.0025f;
            for(int i=0;i<positions.Length;i++) {
                inverseMass[i]=mobile[i] && !(IsGripped && pins[i])?1:0;
                if(!mobile[i]){positions[i]=rest[i]+normals[i]*.0025f;previous[i]=positions[i];continue;}
                if(IsGripped && pins[i]){positions[i]=rest[i]+normals[i]*.0025f+gripDelta;previous[i]=positions[i];continue;}
                Vector3 current=positions[i];
                Vector3 motion=(current-previous[i])*Mathf.Exp(-18f*Step);
                Vector3 attachment=(rest[i]+normals[i]*.0025f-current)*35f;
                positions[i]=current+motion+(attachment+Vector3.down*.10f)*(Step*Step);
                previous[i]=current;
            }
            // In-plane distances resist stretch/shear strongly; second-neighbour constraints bend much more easily.
            // Releasing the grab removes its kinematic constraint completely: there is no hidden oscillator at the tip.
            for(int iteration=0;iteration<6;iteration++) {
                foreach(var edge in edges) {
                    float wa=inverseMass[edge.a],wb=inverseMass[edge.b];if(wa+wb==0)continue;
                    Vector3 delta=positions[edge.b]-positions[edge.a];float length=delta.magnitude;if(length<.000001f)continue;
                    float error=length-edge.length;
                    Vector3 correction=delta*(error/(length*(wa+wb+edge.compliance/(Step*Step))));
                    positions[edge.a]+=correction*wa;positions[edge.b]-=correction*wb;
                }
                for(int i=0;i<positions.Length;i++) {
                    if(IsGripped && pins[i])positions[i]=rest[i]+normals[i]*.0025f+gripDelta;
                    float distance=Vector3.Dot(positions[i]-rest[i],normals[i]);
                    if(distance<.0025f)positions[i]+=normals[i]*(.0025f-distance);
                }
                for(int r=0;r<rows;r++) {
                    int first=r*Columns,last=first+UniqueColumns;
                    Vector3 seam=(positions[first]+positions[last])*.5f;positions[first]=seam;positions[last]=seam;
                }
            }
            for(int i=0;i<positions.Length;i++) {
                if(Vector3.Dot(positions[i]-rest[i],normals[i])<.0027f) {
                    Vector3 motion=positions[i]-previous[i];float inward=Vector3.Dot(motion,normals[i]);
                    if(inward<0)previous[i]=positions[i]-(motion-normals[i]*inward)*.8f;
                }
            }
        }

        public void PreparePose(float time) {
            Initialize();
            if(Mathf.Abs(preparedTime-time)<.00001f)return;
            preparedTime=time;
            int next=Mathf.Clamp((int)(time/8),0,10);
            if(!(time<88&&(next==6||next==7||next==10)))return;
            source.BakeMesh(skinMesh);
            var dense=skinMesh.vertices;var denseNormals=skinMesh.normals;
            int denseRows=dense.Length/97;
            for(int r=0;r<rows;r++)for(int c=0;c<Columns;c++){
                int i=r*Columns+c,original=Mathf.Min(r*2,denseRows-1)*97+c*2;
                Vector3 nextRest=dense[original],shift=nextRest-rest[i];rest[i]=nextRest;normals[i]=denseNormals[original].normalized;
                positions[i]+=shift;previous[i]+=shift;
            }
            for(int k=0;k<edges.Count;k++){var edge=edges[k];edge.length=Vector3.Distance(rest[edge.a],rest[edge.b]);edges[k]=edge;}
            if(chapter!=next||time<clock-Step)ResetPatch(next,next*8);
        }
        public Vector3 DesiredHandPosition(float time) {
            PreparePose(time);
            float local=time-chapter*8,maximum=chapter==7?.10f:.14f;
            float amplitude=maximum*GarmentCharacterMotion.Ease(Mathf.InverseLerp(1.5f,3f,local));
            return source.transform.TransformPoint(rest[gripIndex]+normals[gripIndex]*.0025f+pullDirection*amplitude+Vector3.up*(amplitude*.10f));
        }
        public void Sample(float time) {
            PreparePose(time);
            int nextChapter=Mathf.Clamp((int)(time/8),0,10);
            bool visible=time<88 && (nextChapter==6 || nextChapter==7 || nextChapter==10);
            IsVisible=visible;
            source.enabled=!visible;skinObject.SetActive(visible);shellObject.SetActive(visible);
            if(!visible){IsGripped=false;MaxSeparation=0;GrabSeparation=0;gripObject.SetActive(false);guide.gameObject.SetActive(false);return;}
            float start=nextChapter*8;
            if(chapter!=nextChapter || time<clock-Step)ResetPatch(nextChapter,start);
            while(clock+Step<=time+.00001f){clock+=Step;Integrate(clock);}
            MaxSeparation=0;
            for(int i=0;i<positions.Length;i++) {
                MaxSeparation=Mathf.Max(MaxSeparation,(positions[i]-rest[i]-normals[i]*.0025f).magnitude);
                int neighbor=i%Columns<UniqueColumns?i+1:i-1;
                float natural=Vector3.Distance(rest[i],rest[neighbor]);
                float stretched=Vector3.Distance(positions[i],positions[neighbor]);
                strains[i]=new Color(Mathf.Clamp(stretched/Mathf.Max(.0001f,natural),1,8),Mathf.Max(0,Vector3.Dot(positions[i]-rest[i],pullDirection)),0,1);
            }
            GrabSeparation=Mathf.Max(0,Vector3.Dot(positions[gripIndex]-rest[gripIndex],pullDirection));
            shellMesh.vertices=positions;shellMesh.colors=strains;shellMesh.RecalculateNormals();shellMesh.RecalculateTangents();shellMesh.RecalculateBounds();
            material.SetColor("_FabricColor",chapter==7?new Color(.57f,.55f,.52f):new Color(.015f,.013f,.019f));material.SetFloat("_Density",chapter==7?28:20);
            material.SetFloat("_PatternType",chapter==10?1:0);material.SetFloat("_PatternScale",24);material.SetFloat("_PatternWidth",.05f);
            HandContactError=IsGripped&&useHandAnchor?Vector3.Distance(source.transform.TransformPoint(positions[gripIndex]),handAnchorWorld):0;
            gripObject.SetActive(false);guide.gameObject.SetActive(false);
            gripObject.transform.localPosition=positions[gripIndex];
            guide.SetPosition(0,source.transform.TransformPoint(rest[gripIndex]));guide.SetPosition(1,source.transform.TransformPoint(positions[gripIndex]));
        }

        private void OnDestroy() {
            foreach(var obj in new UnityEngine.Object[]{shellObject,skinObject,gripObject,guide!=null?guide.gameObject:null,shellMesh,skinMesh,material}) {
                if(obj==null)continue;if(Application.isPlaying)Destroy(obj);else DestroyImmediate(obj);
            }
        }
    }
}
