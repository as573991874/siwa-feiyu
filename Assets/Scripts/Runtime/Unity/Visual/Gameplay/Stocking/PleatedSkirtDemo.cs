using System.Collections.Generic;
using UnityEngine;

namespace XXD.Visual.Unity {
    public sealed class PleatedSkirtDemo : MonoBehaviour {
        public Transform character;
        public Transform pelvis;
        public Transform leftThigh, rightThigh, leftCalf, rightCalf;
        public Material[] fabrics;
        public Material beltMaterial;
        public Material liningMaterial;
        public bool IsVisible { get; private set; }
        public bool IsGripped { get; private set; }
        public float HemMin { get; private set; }
        public float HemMax { get; private set; }
        public float AnchorError { get; private set; }
        public int Palette { get; private set; }
        public bool useHandAnchor;
        public Vector3 handAnchorWorld;
        public float HandContactError {get;private set;}
        private Vector3 gripDelta,grabBase;
        private bool hasGrabBase;
        private float lastGrabPlan;
        private const int Around=96;
        private const int Rows=23;
        private const int Stride=Around+1;
        private const float Dt=1f/120;
        private const float Length=.36f;
        private const int GrabColumn=Around*3/8;
        private GameObject root,clothObject,beltObject,liningObject,gripObject;
        private Mesh mesh,beltMesh,liningMesh;
        private MeshRenderer clothRenderer,beltRenderer;
        private Vector3[] rest,positions,previous,drawPositions;
        private float[] inverseMass;
        private Vector2[] uv;
        private struct Edge {public int a,b;public float length,compliance;}
        private readonly List<Edge> edges=new List<Edge>();
        private bool initialized;
        private float clock;
        private Vector3 waist;
        private Quaternion rotation;
        private Vector3 leftA,leftB,rightA,rightB;
        private Material gripMaterial;

        private GameObject Node(string name,Transform parent) {
            var o=new GameObject(name);o.transform.SetParent(parent,false);o.hideFlags=HideFlags.DontSave;return o;
        }
        private void Initialize() {
            if(initialized)return;initialized=true;
            root=Node("PleatedSkirtWardrobe",transform);
            clothObject=Node("SimulatedPleats",root.transform);beltObject=Node("Waistband",root.transform);liningObject=Node("InnerLining",root.transform);
            int count=Rows*Stride;
            rest=new Vector3[count];positions=new Vector3[count];previous=new Vector3[count];drawPositions=new Vector3[count];inverseMass=new float[count];uv=new Vector2[count];
            for(int r=0;r<Rows;r++)for(int c=0;c<=Around;c++) {
                float t=(float)r/(Rows-1),angle=(float)c/Around*Mathf.PI*2;
                float flare=Mathf.Pow(t,.85f);float fold=Mathf.Cos(angle*24)*.026f*flare*Mathf.SmoothStep(0,1,t/.30f);
                int i=r*Stride+c;
                rest[i]=new Vector3(Mathf.Cos(angle)*(.265f+.137f*flare+fold),-Length*t,Mathf.Sin(angle)*(.242f+.107f*flare+fold));
                positions[i]=rest[i];previous[i]=rest[i];uv[i]=new Vector2((float)c/Around,t);
                if(c<Around)AddEdge(i,i+1,.000004f);
                if(r>0){AddEdge(i,i-Stride,.0000005f);if(c>0)AddEdge(i,i-Stride-1,.000025f);if(c<Around)AddEdge(i,i-Stride+1,.000025f);}
                if(r>1)AddEdge(i,i-Stride*2,.0015f);
                if(c>1)AddEdge(i,i-2,.0015f);
            }
            // Rebuild rest lengths after every rest vertex has been authored.
            for(int k=0;k<edges.Count;k++){var e=edges[k];e.length=Vector3.Distance(rest[e.a],rest[e.b]);edges[k]=e;}
            var triangles=new List<int>();
            for(int r=0;r<Rows-1;r++)for(int c=0;c<Around;c++){
                int i=r*Stride+c,n=i+Stride;
                triangles.Add(i);triangles.Add(i+1);triangles.Add(n);triangles.Add(i+1);triangles.Add(n+1);triangles.Add(n);
            }
            mesh=new Mesh{name="PleatedSkirtSurface",hideFlags=HideFlags.DontSave};mesh.MarkDynamic();mesh.vertices=rest;mesh.uv=uv;mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();mesh.RecalculateBounds();
            (clothObject.AddComponent(typeof(MeshFilter)) as MeshFilter).sharedMesh=mesh;clothRenderer=clothObject.AddComponent(typeof(MeshRenderer)) as MeshRenderer;clothRenderer.sharedMaterial=fabrics[0];
            beltMesh=WaistbandMesh();
            (beltObject.AddComponent(typeof(MeshFilter)) as MeshFilter).sharedMesh=beltMesh;beltRenderer=beltObject.AddComponent(typeof(MeshRenderer)) as MeshRenderer;beltRenderer.sharedMaterial=beltMaterial;
            liningMesh=BandMesh(.250f,.230f,.292f,.256f,-.02f,-.285f);
            (liningObject.AddComponent(typeof(MeshFilter)) as MeshFilter).sharedMesh=liningMesh;(liningObject.AddComponent(typeof(MeshRenderer)) as MeshRenderer).sharedMaterial=liningMaterial;
            gripObject=GameObject.CreatePrimitive(PrimitiveType.Sphere);gripObject.name="SkirtHemGrabPoint";gripObject.transform.SetParent(root.transform,false);gripObject.transform.localScale=Vector3.one*.014f;gripObject.hideFlags=HideFlags.DontSave;
            var collider=gripObject.GetComponent(typeof(Collider));if(collider!=null)DestroyImmediate(collider);
            gripMaterial=new Material(Shader.Find("Universal Render Pipeline/Unlit")){hideFlags=HideFlags.DontSave};gripMaterial.color=new Color(1,.63f,.2f);gripObject.GetComponent<Renderer>().sharedMaterial=gripMaterial;
            root.SetActive(false);
        }
        private void AddEdge(int a,int b,float compliance){edges.Add(new Edge{a=a,b=b,compliance=compliance});}
        private Mesh WaistbandMesh(){
            // Rounded, tapered yoke overlaps the tucked shirt and the flat pleat roots.
            var profile=new[]{new Vector3(.265f,.244f,.022f),new Vector3(.269f,.248f,.015f),new Vector3(.297f,.272f,-.045f),new Vector3(.300f,.275f,-.060f)};
            var vertices=new Vector3[Stride*profile.Length];var texcoords=new Vector2[vertices.Length];var tris=new List<int>();
            for(int r=0;r<profile.Length;r++)for(int c=0;c<=Around;c++){
                float a=(float)c/Around*Mathf.PI*2;int i=r*Stride+c;
                vertices[i]=new Vector3(Mathf.Cos(a)*profile[r].x,profile[r].z,Mathf.Sin(a)*profile[r].y);
                texcoords[i]=new Vector2((float)c/Around,(float)r/(profile.Length-1));
                if(r<profile.Length-1&&c<Around){int next=i+Stride;tris.Add(i);tris.Add(i+1);tris.Add(next);tris.Add(i+1);tris.Add(next+1);tris.Add(next);}
            }
            var result=new Mesh{name="TailoredWaistYoke",hideFlags=HideFlags.DontSave};result.vertices=vertices;result.uv=texcoords;result.SetTriangles(tris,0);result.RecalculateNormals();result.RecalculateBounds();return result;
        }
        private Mesh BandMesh(float topX,float topZ,float bottomX,float bottomZ,float topY,float bottomY){
            var vertices=new Vector3[Stride*2];var texcoords=new Vector2[vertices.Length];var tris=new List<int>();
            for(int c=0;c<=Around;c++){
                float a=(float)c/Around*Mathf.PI*2;vertices[c]=new Vector3(Mathf.Cos(a)*topX,topY,Mathf.Sin(a)*topZ);vertices[c+Stride]=new Vector3(Mathf.Cos(a)*bottomX,bottomY,Mathf.Sin(a)*bottomZ);texcoords[c]=new Vector2((float)c/Around,0);texcoords[c+Stride]=new Vector2((float)c/Around,1);
                if(c<Around){tris.Add(c);tris.Add(c+1);tris.Add(c+Stride);tris.Add(c+1);tris.Add(c+Stride+1);tris.Add(c+Stride);}
            }
            var result=new Mesh{name="SkirtBand",hideFlags=HideFlags.DontSave};result.vertices=vertices;result.uv=texcoords;result.SetTriangles(tris,0);result.RecalculateNormals();result.RecalculateBounds();return result;
        }
        private Vector3 CapsuleProjection(Vector3 p,Vector3 a,Vector3 b,float radius){
            Vector3 line=b-a;float along=Mathf.Clamp01(Vector3.Dot(p-a,line)/Mathf.Max(.000001f,line.sqrMagnitude));Vector3 center=a+line*along,delta=p-center;float d=delta.magnitude;
            if(d<radius && d>.00001f)p=center+delta*(radius/d);return p;
        }
        private void Integrate(float time){
            float local=time-88;
            bool grabSection=time>=104 && time<112;float grabTime=time-104;
            IsGripped=grabSection && grabTime>=1.5f && grabTime<4.6f;
            float grab=GarmentCharacterMotion.Ease(Mathf.InverseLerp(1.5f,3.0f,grabTime));
            float breeze=time>=96&&time<104?1:time>=112?.65f:.35f;
            Vector3 wind=new Vector3(Mathf.Sin(local*1.7f)*1.8f*breeze,.25f*breeze,Mathf.Sin(local*.85f+.6f)*1.2f*breeze);
            Vector3 inertial=new Vector3(-Mathf.Sin(local*1.5f)*.8f,0,Mathf.Sin(local*1.1f)*.35f);
            int grabColumn=GrabColumn;
            gripDelta=new Vector3(-.10f,.22f,.07f)*grab;
            if(useHandAnchor)gripDelta=root.transform.InverseTransformPoint(handAnchorWorld)-rest[(Rows-1)*Stride+grabColumn];
            for(int i=0;i<positions.Length;i++){
                int row=i/Stride,column=i%Stride;bool pinned=row<2;
                bool held=IsGripped && row>=Rows-3 && Mathf.Abs(column-grabColumn)<=2;
                inverseMass[i]=pinned||held?0:1;
                if(pinned){positions[i]=rest[i];previous[i]=positions[i];continue;}
                if(held){positions[i]=rest[i]+gripDelta;previous[i]=positions[i];continue;}
                Vector3 current=positions[i];Vector3 speed=(current-previous[i])*Mathf.Exp(-5.5f*Dt);
                float hemWeight=(float)row/(Rows-1);
                Vector3 memory=(rest[i]-current)*5;
                positions[i]=current+speed+(Vector3.down*9.81f+(wind+inertial)*hemWeight+memory)*(Dt*Dt);previous[i]=current;
            }
            for(int iteration=0;iteration<8;iteration++){
                foreach(var e in edges){float wa=inverseMass[e.a],wb=inverseMass[e.b];if(wa+wb==0)continue;Vector3 delta=positions[e.b]-positions[e.a];float length=delta.magnitude;if(length<.000001f)continue;Vector3 change=delta*((length-e.length)/(length*(wa+wb+e.compliance/(Dt*Dt))));positions[e.a]+=change*wa;positions[e.b]-=change*wb;}
                for(int r=0;r<Rows;r++){
                    for(int c=0;c<=Around;c++){
                        int i=r*Stride+c;if(r<2){positions[i]=rest[i];continue;}
                        if(IsGripped && r>=Rows-3 && Mathf.Abs(c-grabColumn)<=2){positions[i]=rest[i]+gripDelta;continue;}
                        Vector3 p=positions[i];p=CapsuleProjection(p,leftA,leftB,.135f);p=CapsuleProjection(p,rightA,rightB,.135f);
                        // Keep pleats outside the opaque lining as well as the legs.
                        float liningT=Mathf.Clamp01((-p.y-.02f)/.265f);
                        float liningX=Mathf.Lerp(.250f,.292f,liningT)+.006f;
                        float liningZ=Mathf.Lerp(.230f,.256f,liningT)+.006f;
                        float ellipse=p.x*p.x/(liningX*liningX)+p.z*p.z/(liningZ*liningZ);
                        if(p.y>-.29f && ellipse<1){float scale=1/Mathf.Sqrt(Mathf.Max(.001f,ellipse));p.x*=scale;p.z*=scale;}
                        positions[i]=p;
                    }
                    int first=r*Stride,last=first+Around;Vector3 seam=(positions[first]+positions[last])*.5f;positions[first]=seam;positions[last]=seam;
                }
            }
        }
        public void PreparePose(float hipYaw){
            Initialize();waist=pelvis.position+character.up*.137f;rotation=character.rotation*Quaternion.Euler(0,hipYaw,0);
            root.transform.position=waist;root.transform.rotation=rotation;
        }
        public Vector3 DesiredHandPosition(float time){
            if(!hasGrabBase||time<lastGrabPlan){grabBase=positions[(Rows-1)*Stride+GrabColumn];hasGrabBase=true;}
            lastGrabPlan=time;
            float grab=GarmentCharacterMotion.Ease(Mathf.InverseLerp(1.5f,3f,time-104));
            return root.transform.TransformPoint(grabBase+new Vector3(-.10f,.22f,.07f)*grab);
        }
        public void Sample(float time,float hipYaw){
            Initialize();if(time<104||time>=112)hasGrabBase=false;IsVisible=time>=88 && time<120;root.SetActive(IsVisible);if(!IsVisible){IsGripped=false;return;}
            waist=pelvis.position+character.up*.137f;rotation=character.rotation*Quaternion.Euler(0,hipYaw,0);
            root.transform.position=waist;root.transform.rotation=rotation;
            leftA=root.transform.InverseTransformPoint(leftThigh.position);leftB=root.transform.InverseTransformPoint(leftCalf.position);rightA=root.transform.InverseTransformPoint(rightThigh.position);rightB=root.transform.InverseTransformPoint(rightCalf.position);
            if(clock<88 || time<clock-Dt){clock=88;for(int i=0;i<positions.Length;i++){positions[i]=rest[i];previous[i]=rest[i];}}
            while(clock+Dt<=time+.00001f){clock+=Dt;Integrate(clock);}
            HemMin=float.PositiveInfinity;HemMax=float.NegativeInfinity;AnchorError=0;
            for(int i=0;i<positions.Length;i++){
                drawPositions[i]=positions[i];if(i<Stride*2)AnchorError=Mathf.Max(AnchorError,Vector3.Distance(positions[i],rest[i]));
                if(i/Stride==Rows-1){float y=root.transform.TransformPoint(positions[i]).y;HemMin=Mathf.Min(HemMin,y);HemMax=Mathf.Max(HemMax,y);}
            }
            mesh.vertices=drawPositions;mesh.RecalculateNormals();mesh.RecalculateBounds();
            Palette=time<112?0:Mathf.Clamp((int)((time-112)/2.6666667f),0,2);clothRenderer.sharedMaterial=fabrics[Palette];
            beltMaterial.SetColor("_BaseColor",fabrics[Palette].GetColor("_BaseColor")*.72f);
            HandContactError=IsGripped&&useHandAnchor?Vector3.Distance(root.transform.TransformPoint(positions[(Rows-1)*Stride+GrabColumn]),handAnchorWorld):0;
            gripObject.SetActive(false);gripObject.transform.localPosition=positions[(Rows-1)*Stride+GrabColumn];
        }
        private void OnDestroy(){foreach(var obj in new Object[]{root,mesh,beltMesh,liningMesh,gripMaterial}){if(obj==null)continue;if(Application.isPlaying)Destroy(obj);else DestroyImmediate(obj);}}
    }
}
