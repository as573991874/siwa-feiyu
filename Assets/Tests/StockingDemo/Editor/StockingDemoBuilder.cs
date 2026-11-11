using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using XXD.Visual.Unity;

public static class StockingDemoBuilder {
    public const string Folder = "Assets/Tests/StockingDemo/Generated";
    public const string ScenePath = Folder + "/StockingDemo.unity";
    private const string SourceModel = "Assets/Arts/Models/Monster/GuanXiangTangNvDiZi/Part01/GuanXiangTangNvDiZi@Skin.fbx";
    private const string SourceTexture = "Assets/Arts/Models/Monster/GuanXiangTangNvDiZi/Materials/GuanXiangTangNvDiZi.png";
    private static StockingDemoPlayer player;
    private static RenderTexture target;
    private static Texture2D pixels;
    private static string output;
    private static int frame;
    private static int total;
    private static bool preview;
    private static RenderPipelineAsset previousGraphics;
    private static RenderPipelineAsset previousQuality;
    private static int previousAntiAliasing;
    private static float recordingStart,recordingDuration;
    private static StreamWriter pullMetrics;
    private static float[] PreviewTimes = { 1,2,3,49.3f,51.5f,53,57.3f,59.5f,61,83.5f,89,91,105.3f,107.5f,109,115.5f };

    [MenuItem("XXD/渲染演示/生成丝袜演示场景")]
    public static void Build() {
        Directory.CreateDirectory(Folder);
        AssetDatabase.Refresh();
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(.25f,.28f,.35f);
        RenderSettings.ambientEquatorColor = new Color(.14f,.16f,.20f);
        RenderSettings.ambientGroundColor = new Color(.09f,.08f,.09f);
        RenderSettings.fog = false;
        var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
        Save(rendererData, "StockingRenderer.asset");
        var pipeline = UniversalRenderPipelineAsset.Create(rendererData);
        pipeline.supportsHDR = true;
        pipeline.msaaSampleCount = 4;
        pipeline.shadowDistance = 12;
        var pipelineSettings = new SerializedObject(pipeline);
        pipelineSettings.FindProperty("m_MainLightShadowmapResolution").intValue = 2048;
        pipelineSettings.FindProperty("m_MainLightShadowsSupported").boolValue = true;
        pipelineSettings.FindProperty("m_SoftShadowsSupported").boolValue = true;
        pipelineSettings.FindProperty("m_AdditionalLightsRenderingMode").intValue = (int)LightRenderingMode.PerPixel;
        pipelineSettings.ApplyModifiedPropertiesWithoutUndo();
        pipeline.maxAdditionalLightsCount = 4;
        Save(pipeline, "StockingPipeline.asset");
        var root = new GameObject("StockingDemo");
        player = root.AddComponent(typeof(StockingDemoPlayer)) as StockingDemoPlayer;
        player.autoPlay = false;
        player.demoPipeline = pipeline;
        var character = UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(SourceModel));
        character.name = "GuanXiangTangNvDiZi_StockingCopy";
        character.transform.SetParent(root.transform,false);
        foreach (Animator animator in character.GetComponentsInChildren(typeof(Animator),true)) UnityEngine.Object.DestroyImmediate(animator);
        foreach (Animation animation in character.GetComponentsInChildren(typeof(Animation),true)) UnityEngine.Object.DestroyImmediate(animation);
        var body = character.GetComponentsInChildren(typeof(SkinnedMeshRenderer),true).Cast<SkinnedMeshRenderer>().First(r => r.name == "GuanXiangTangNvDiZi");
        foreach (var render in character.GetComponentsInChildren(typeof(Renderer),true).Cast<Renderer>()) if (render != body) render.enabled = false;
        var cloth = new Material(Shader.Find("Universal Render Pipeline/Lit"));
        cloth.name = "OriginalCharacter_Dress";
        cloth.SetTexture("_BaseMap",AssetDatabase.LoadAssetAtPath<Texture2D>(SourceTexture));
        cloth.SetFloat("_Smoothness",.24f);cloth.SetFloat("_Cull",0);cloth.SetFloat("_AlphaClip",1);cloth.SetFloat("_Cutoff",.35f);cloth.EnableKeyword("_ALPHATEST_ON");
        Save(cloth,"Dress.mat");body.sharedMaterial=cloth;
        var baked = new Mesh();
        body.BakeMesh(baked);
        Debug.Log("[StockingDemo] rawBounds="+body.sharedMesh.bounds+" bakedBounds="+baked.bounds+" meshTransform="+body.transform.localToWorldMatrix);
        var clipped = ClipAtHeight(body.sharedMesh,baked.vertices,body.transform,character.transform,1.12f);
        UnityEngine.Object.DestroyImmediate(baked);
        clipped.name="GuanXiangTangNvDiZi_ShortRobe"; Save(clipped,"ShortRobe.asset");body.sharedMesh=clipped;
        player.character=character.transform;
        player.pelvis=Find(character,"Bip001 Pelvis");
        player.leftThigh=Find(character,"Bip001 L Thigh");player.rightThigh=Find(character,"Bip001 R Thigh");
        player.leftCalf=Find(character,"Bip001 L Calf");player.rightCalf=Find(character,"Bip001 R Calf");
        player.leftFoot=Find(character,"Bip001 L Foot");player.rightFoot=Find(character,"Bip001 R Foot");
        player.leftArm=Find(character,"Bip001 L UpperArm");player.rightArm=Find(character,"Bip001 R UpperArm");
        var stocking = new Material(Shader.Find("XXD/Demo/StockingFiber"));stocking.name="BlackSilk_22D";
        stocking.SetColor("_SkinColor",new Color(.62f,.49f,.42f));
        Save(stocking,"BlackSilk.mat");player.stocking=stocking;
        CreateLeg(character.transform,player.leftThigh,player.leftCalf,player.leftFoot,-1,stocking);
        CreateLeg(character.transform,player.rightThigh,player.rightCalf,player.rightFoot,1,stocking);
        player.legRenderers=character.GetComponentsInChildren(typeof(SkinnedMeshRenderer),true).Cast<SkinnedMeshRenderer>().Where(r=>r.name.StartsWith("StockingLeg")).ToArray();
        var cameraObject=new GameObject("DemoCamera"); cameraObject.transform.SetParent(root.transform);
        var camera=cameraObject.AddComponent(typeof(Camera)) as Camera;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.024f,.031f,.046f);camera.nearClipPlane=.03f;camera.farClipPlane=30;camera.allowHDR=true;camera.allowMSAA=true;
        var cameraData=cameraObject.AddComponent(typeof(UniversalAdditionalCameraData)) as UniversalAdditionalCameraData;
        cameraData.renderPostProcessing=true;cameraData.antialiasing=AntialiasingMode.SubpixelMorphologicalAntiAliasing;cameraData.antialiasingQuality=AntialiasingQuality.High;
        player.demoCamera=camera;
        player.keyLight=Light("Key_Softbox",LightType.Directional,new Vector3(0,4,3),new Color(1,.94f,.88f),1.1f,root.transform);
        player.keyLight.shadows=LightShadows.Soft;player.keyLight.shadowBias=.025f;player.keyLight.shadowNormalBias=.15f;
        Light("Cool_Fill",LightType.Point,new Vector3(-2,1.5f,2),new Color(.67f,.78f,1),3,root.transform);
        Light("Warm_Rim",LightType.Point,new Vector3(1.8f,1.7f,-1.5f),new Color(1,.79f,.61f),6,root.transform);
        Light("Front_Fill",LightType.Point,new Vector3(.4f,.7f,2.5f),new Color(.8f,.87f,1),1.5f,root.transform);
        var floorMat=Lit(new Color(.055f,.067f,.085f),.24f);Save(floorMat,"StudioFloor.mat");
        var floor=GameObject.CreatePrimitive(PrimitiveType.Plane);floor.name="StudioFloor";floor.transform.SetParent(root.transform);floor.transform.localScale=Vector3.one*3;floor.GetComponent<Renderer>().sharedMaterial=floorMat;
        var platform=GameObject.CreatePrimitive(PrimitiveType.Cylinder);platform.name="DisplayPlinth";platform.transform.SetParent(root.transform);platform.transform.localPosition=new Vector3(0,-.035f,0);platform.transform.localScale=new Vector3(1.25f,.035f,1.25f);platform.GetComponent<Renderer>().sharedMaterial=Lit(new Color(.09f,.105f,.135f),.35f);
        Save(platform.GetComponent<Renderer>().sharedMaterial,"Plinth.mat");
        platform.SetActive(false);
        var volumeObject=new GameObject("StudioPostProcessing");volumeObject.transform.SetParent(root.transform);var volume=volumeObject.AddComponent(typeof(Volume)) as Volume;volume.isGlobal=true;
        var profile=ScriptableObject.CreateInstance<VolumeProfile>();
        var tone=profile.Add<Tonemapping>();tone.mode.Override(TonemappingMode.ACES);
        var color=profile.Add<ColorAdjustments>();color.postExposure.Override(.25f);color.contrast.Override(8);color.saturation.Override(-5);
        var vignette=profile.Add<Vignette>();vignette.intensity.Override(.18f);vignette.smoothness.Override(.6f);
        Save(profile,"StudioPost.asset");foreach(var item in profile.components) AssetDatabase.AddObjectToAsset(item,profile);volume.sharedProfile=profile;
        var comparison=new GameObject("DensityComparison");comparison.transform.SetParent(root.transform);player.comparison=comparison;
        // Reuse the same project character and new leg meshes for a controlled material comparison.
        for(int i=0;i<3;i++) {
            var clone=UnityEngine.Object.Instantiate(character,comparison.transform);clone.name="Compare_"+i;clone.transform.localPosition=new Vector3((i-1)*.85f,0,0);
            var mat=new Material(stocking);mat.name="CompareMaterial_"+i;mat.SetFloat("_Denier",new[]{65,22,0}[i]);
            var cloneLeft=Find(clone,"Bip001 L UpperArm");var cloneRight=Find(clone,"Bip001 R UpperArm");
            cloneLeft.localRotation*=Quaternion.AngleAxis(47,cloneLeft.InverseTransformDirection(clone.transform.forward));
            cloneRight.localRotation*=Quaternion.AngleAxis(-47,cloneRight.InverseTransformDirection(clone.transform.forward));
            foreach(var r in clone.GetComponentsInChildren(typeof(SkinnedMeshRenderer),true).Cast<SkinnedMeshRenderer>()) if(r.name.StartsWith("StockingLeg")) r.sharedMaterial=mat;
            Save(mat,"Comparison"+i+".mat");
        }
        comparison.SetActive(false);
        player.netGallery=CreateGallery(root.transform,character,"FishnetGallery",new[]{1,1,1},new[]{42f,24f,13f},new[]{.065f,.05f,.032f},new[]{"FineFishnet","ClassicFishnet","WideDiamond"});
        player.decorativeGallery=CreateGallery(root.transform,character,"DecorativeGallery",new[]{2,3,4},new[]{22f,21f,24f},new[]{.045f,.05f,.05f},new[]{"FloralLace","PolkaDot","BackSeam"});
        var shellMaterial=new Material(Shader.Find("XXD/Demo/StockingElasticShell"));Save(shellMaterial,"ElasticShell.mat");
        var skinMaterial=Lit(new Color(.62f,.49f,.42f),.22f);Save(skinMaterial,"UnderlyingSkin.mat");
        var elastic=root.AddComponent(typeof(StockingElasticPull)) as StockingElasticPull;
        elastic.source=player.legRenderers.First(r=>r.name=="StockingLeg_-1");elastic.shellMaterial=shellMaterial;elastic.skinMaterial=skinMaterial;
        player.elasticPull=elastic;
        var skirtBake=new Mesh();body.BakeMesh(skirtBake);
        var skirtTop=ClipAtHeight(body.sharedMesh,skirtBake.vertices,body.transform,character.transform,1.40f,Array.IndexOf(body.bones,player.pelvis));UnityEngine.Object.DestroyImmediate(skirtBake);Save(skirtTop,"SkirtTop.asset");
        player.torsoRenderer=body;player.plainTorsoMesh=body.sharedMesh;player.skirtTorsoMesh=skirtTop;
        var skirtBody=new GameObject("SkirtOutfitTop");skirtBody.transform.SetParent(body.transform.parent,false);skirtBody.transform.localPosition=body.transform.localPosition;skirtBody.transform.localRotation=body.transform.localRotation;skirtBody.transform.localScale=body.transform.localScale;
        var skirtBodyRenderer=skirtBody.AddComponent(typeof(SkinnedMeshRenderer)) as SkinnedMeshRenderer;skirtBodyRenderer.sharedMesh=skirtTop;skirtBodyRenderer.bones=body.bones;skirtBodyRenderer.rootBone=body.rootBone;skirtBodyRenderer.sharedMaterial=body.sharedMaterial;skirtBodyRenderer.updateWhenOffscreen=true;skirtBodyRenderer.localBounds=body.localBounds;skirtBodyRenderer.enabled=false;player.skirtTorsoRenderer=skirtBodyRenderer;
        var skirts=new Material[3];var skirtNames=new[]{"RosePlaidSkirt","NavyPleatedSkirt","WinePlaidSkirt"};
        var skirtColors=new[]{new Color(.48f,.31f,.29f),new Color(.035f,.065f,.12f),new Color(.26f,.035f,.065f)};
        for(int i=0;i<3;i++){skirts[i]=new Material(Shader.Find("XXD/Demo/PleatedFabric"));skirts[i].SetColor("_BaseColor",skirtColors[i]);skirts[i].SetColor("_StripeColor",new Color(.07f,.055f,.07f));skirts[i].SetFloat("_Plaid",i==1?0:i==2?.55f:1);Save(skirts[i],skirtNames[i]+".mat");}
        var belt=new Material(Shader.Find("XXD/Demo/PleatedFabric"));belt.SetFloat("_Plaid",0);belt.SetColor("_BaseColor",skirtColors[0]*.72f);Save(belt,"SkirtWaistband.mat");
        var lining=Lit(new Color(.025f,.019f,.025f),.12f);lining.SetFloat("_Cull",0);Save(lining,"SkirtLining.mat");
        var skirt=root.AddComponent(typeof(PleatedSkirtDemo)) as PleatedSkirtDemo;
        skirt.character=character.transform;skirt.pelvis=player.pelvis;skirt.leftThigh=player.leftThigh;skirt.rightThigh=player.rightThigh;skirt.leftCalf=player.leftCalf;skirt.rightCalf=player.rightCalf;
        skirt.fabrics=skirts;skirt.beltMaterial=belt;skirt.liningMaterial=lining;player.skirt=skirt;

        var leftRest=player.leftArm.localRotation;var rightRest=player.rightArm.localRotation;
        var pelvisRest=player.pelvis.localPosition;
        player.Initialize();player.Sample(0);
        player.leftArm.localRotation=leftRest;player.rightArm.localRotation=rightRest;player.pelvis.localPosition=pelvisRest;
        player.Motion.ResetPose();character.transform.localRotation=Quaternion.identity;
        player.autoPlay=true;
        EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(),ScenePath);
        AssetDatabase.SaveAssets();
        Debug.Log("[StockingDemo] Build complete: "+ScenePath+" source="+SourceModel+" bounds="+body.bounds);
    }

    private static GameObject CreateGallery(Transform root,GameObject source,string name,int[] styles,float[] scales,float[] widths,string[] names) {
        var group=new GameObject(name);group.transform.SetParent(root,false);
        for(int i=0;i<3;i++) {
            var clone=UnityEngine.Object.Instantiate(source,group.transform);clone.name=names[i];clone.transform.localPosition=new Vector3((1-i)*.85f,0,0);
            if(styles[i]==4)clone.transform.localRotation=Quaternion.Euler(0,180,0);
            var material=new Material(Shader.Find("XXD/Demo/StockingFiber"));material.name=names[i];
            material.SetColor("_SkinColor",new Color(.62f,.49f,.42f));material.SetColor("_FabricColor",new Color(.012f,.010f,.016f));
            material.SetFloat("_PatternType",styles[i]);material.SetFloat("_PatternScale",scales[i]);material.SetFloat("_PatternWidth",widths[i]);
            foreach(var renderer in clone.GetComponentsInChildren(typeof(SkinnedMeshRenderer),true).Cast<SkinnedMeshRenderer>())if(renderer.name.StartsWith("StockingLeg"))renderer.sharedMaterial=material;
            var left=Find(clone,"Bip001 L UpperArm");var right=Find(clone,"Bip001 R UpperArm");
            left.localRotation*=Quaternion.AngleAxis(47,left.InverseTransformDirection(clone.transform.forward));right.localRotation*=Quaternion.AngleAxis(-47,right.InverseTransformDirection(clone.transform.forward));
            Save(material,names[i]+".mat");
        }
        group.SetActive(false);return group;
    }

    private static Transform Find(GameObject root,string name) {return root.GetComponentsInChildren(typeof(Transform),true).Cast<Transform>().First(t=>t.name==name);}
    private static Material Lit(Color color,float smoothness) {var mat=new Material(Shader.Find("Universal Render Pipeline/Lit"));mat.color=color;mat.SetFloat("_Smoothness",smoothness);return mat;}
    private static Light Light(string name,LightType type,Vector3 position,Color color,float intensity,Transform root) {var o=new GameObject(name);o.transform.SetParent(root);o.transform.position=position;var l=o.AddComponent(typeof(Light)) as Light;l.type=type;l.color=color;l.intensity=intensity;l.range=8;return l;}
    private static void Save(UnityEngine.Object asset,string name) {var path=Folder+"/"+name;AssetDatabase.DeleteAsset(path);AssetDatabase.CreateAsset(asset,path);}

    private struct Vertex {
        public Vector3 p,n; public Vector4 t; public Vector2 uv; public BoneWeight w;public float h;public Vector3 posed;
    }
    private static Vertex Interpolate(Vertex a,Vertex b,float u) {
        var weights=new Dictionary<int,float>();
        Accumulate(weights,a.w,1-u);Accumulate(weights,b.w,u);
        var sorted=weights.OrderByDescending(pair=>pair.Value).Take(4).ToArray();var ids=new int[4];var values=new float[4];float sum=sorted.Sum(pair=>pair.Value);
        for(int k=0;k<sorted.Length;k++){ids[k]=sorted[k].Key;values[k]=sorted[k].Value/sum;}
        return new Vertex{posed=Vector3.Lerp(a.posed,b.posed,u),h=Mathf.Lerp(a.h,b.h,u),p=Vector3.Lerp(a.p,b.p,u),n=Vector3.Lerp(a.n,b.n,u).normalized,t=Vector4.Lerp(a.t,b.t,u),uv=Vector2.Lerp(a.uv,b.uv,u),w=new BoneWeight{boneIndex0=ids[0],boneIndex1=ids[1],boneIndex2=ids[2],boneIndex3=ids[3],weight0=values[0],weight1=values[1],weight2=values[2],weight3=values[3]}};
    }
    private static void Accumulate(Dictionary<int,float> d,BoneWeight w,float scale) {var ids=new[]{w.boneIndex0,w.boneIndex1,w.boneIndex2,w.boneIndex3};var ws=new[]{w.weight0,w.weight1,w.weight2,w.weight3};for(int k=0;k<4;k++){if(!d.ContainsKey(ids[k]))d[ids[k]]=0;d[ids[k]]+=ws[k]*scale;}}
    private static Mesh ClipAtHeight(Mesh source,Vector3[] bakedPositions,Transform meshTransform,Transform root,float height,int waistBone=-1) {
        var p=source.vertices;var n=source.normals;var t=source.tangents;var uv=source.uv;var w=source.boneWeights;
        var outputVertices=new List<Vertex>();var indices=new List<int>();
        var heightByPosition=new Dictionary<Vector3,float>();
        for(int i=0;i<p.Length;i++) heightByPosition[p[i]]=root.InverseTransformPoint(meshTransform.TransformPoint(bakedPositions[i])).y-height;
        var triangles=source.triangles;
        for(int j=0;j<triangles.Length;j+=3) {
            var polygon=new List<Vertex>();
            for(int k=0;k<3;k++){int id=triangles[j+k];polygon.Add(new Vertex{posed=root.InverseTransformPoint(meshTransform.TransformPoint(bakedPositions[id])),h=heightByPosition[p[id]],p=p[id],n=n[id],t=t.Length>id?t[id]:new Vector4(1,0,0,1),uv=uv[id],w=w[id]});}
            var cut=new List<Vertex>();
            for(int k=0;k<3;k++){var a=polygon[k];var b=polygon[(k+1)%3];float ha=heightByPosition[a.p],hb=heightByPosition[b.p];if(ha>=0)cut.Add(a);if((ha>=0)!=(hb>=0))cut.Add(Interpolate(a,b,ha/(ha-hb)));}
            if(cut.Count<3)continue;
            int start=outputVertices.Count;outputVertices.AddRange(cut);for(int k=1;k<cut.Count-1;k++){indices.Add(start);indices.Add(start+k);indices.Add(start+k+1);}
        }
        if(waistBone>=0)for(int i=0;i<outputVertices.Count;i++){
            var vertex=outputVertices[i];if(Mathf.Abs(vertex.posed.x)>.34f||Mathf.Abs(vertex.posed.z)>.32f)continue;float blend=Mathf.SmoothStep(0,1,Mathf.InverseLerp(0,.13f,vertex.h));
            var pinned=new Vertex{w=new BoneWeight{boneIndex0=waistBone,weight0=1}};
            vertex.w=Interpolate(pinned,vertex,blend).w;outputVertices[i]=vertex;
        }
        var mesh=new Mesh();mesh.indexFormat=IndexFormat.UInt32;mesh.vertices=outputVertices.Select(v=>v.p).ToArray();mesh.normals=outputVertices.Select(v=>v.n).ToArray();mesh.tangents=outputVertices.Select(v=>v.t).ToArray();mesh.uv=outputVertices.Select(v=>v.uv).ToArray();mesh.boneWeights=outputVertices.Select(v=>v.w).ToArray();mesh.bindposes=source.bindposes;mesh.SetTriangles(indices,0);mesh.RecalculateBounds();return mesh;
    }

    private static void CreateLeg(Transform root,Transform thigh,Transform calf,Transform foot,int side,Material material) {
        // Profile follows the source character's hip, knee and ankle heights; all dimensions are metres.
        var profile=new[]{
            new Vector4(1.28f,0,.122f,.127f),new Vector4(1.16f,0,.124f,.126f),new Vector4(1.04f,.003f,.122f,.119f),
            new Vector4(.91f,.014f,.108f,.108f),new Vector4(.79f,.023f,.088f,.085f),new Vector4(.70f,.025f,.078f,.079f),
            new Vector4(.63f,.010f,.080f,.075f),new Vector4(.54f,-.005f,.095f,.086f),new Vector4(.44f,-.016f,.097f,.086f),
            new Vector4(.34f,-.011f,.078f,.071f),new Vector4(.24f,-.005f,.058f,.054f),new Vector4(.16f,.003f,.049f,.049f),
            new Vector4(.105f,.025f,.053f,.054f),new Vector4(.073f,.085f,.064f,.045f),new Vector4(.054f,.155f,.067f,.037f),
            new Vector4(.047f,.22f,.061f,.029f),new Vector4(.046f,.255f,.032f,.019f),new Vector4(.046f,.264f,.002f,.002f)};
        const int around=96;const int steps=9;int rings=(profile.Length-1)*steps+1;
        var vertices=new Vector3[rings*(around+1)];var texcoords=new Vector2[vertices.Length];var patternTexcoords=new Vector2[vertices.Length];var weights=new BoneWeight[vertices.Length];var indices=new List<int>();
        var centers=new Vector3[rings];var radii=new Vector2[rings];
        for(int r=0;r<rings;r++) {
            float f=(float)r/steps;int k=Mathf.Min((int)f,profile.Length-2);float u=f-k;
            Vector4 a=profile[Mathf.Max(0,k-1)],b=profile[k],c=profile[k+1],d=profile[Mathf.Min(profile.Length-1,k+2)];
            Vector4 v=.5f*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);
            float x=side*Mathf.Lerp(.114f,.15f,Mathf.Clamp01((1.28f-v.x)/1.2f));
            centers[r]=new Vector3(x,v.x,v.y);radii[r]=new Vector2(v.z,v.w);
        }
        float arcLength=0;
        for(int r=0;r<rings;r++) {
            if(r>0)arcLength+=Vector3.Distance(centers[r],centers[r-1]);
            var center=centers[r];var along=(centers[Mathf.Min(r+1,rings-1)]-centers[Mathf.Max(0,r-1)]).normalized;
            var front=Vector3.Cross(along,Vector3.right).normalized;
            float kneeBlend=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.78f,.61f,center.y));
            float footBlend=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.19f,.075f,center.y));
            for(int a=0;a<=around;a++) {
                float theta=(float)a/around*Mathf.PI*2;int id=r*(around+1)+a;
                float asymmetric=1+.018f*Mathf.Sin(theta*3)*Mathf.Exp(-Mathf.Pow((center.y-.48f)/.2f,2));
                vertices[id]=center+Vector3.right*(Mathf.Cos(theta)*radii[r].x*asymmetric)+front*(Mathf.Sin(theta)*radii[r].y);
                texcoords[id]=new Vector2((float)a/around,center.y);
                patternTexcoords[id]=new Vector2((float)a/around,1.28f-arcLength);
                weights[id]=new BoneWeight{boneIndex0=0,boneIndex1=1,boneIndex2=2,weight0=(1-kneeBlend)*(1-footBlend),weight1=kneeBlend*(1-footBlend),weight2=footBlend};
                if(r<rings-1 && a<around){int next=id+around+1;indices.Add(id);indices.Add(id+1);indices.Add(next);indices.Add(id+1);indices.Add(next+1);indices.Add(next);}
            }
        }
        var mesh=new Mesh{name="StockingLeg_"+side};mesh.indexFormat=IndexFormat.UInt32;mesh.vertices=vertices;mesh.uv=texcoords;mesh.uv2=patternTexcoords;mesh.boneWeights=weights;mesh.SetTriangles(indices,0);mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();
        var o=new GameObject("StockingLeg_"+side);o.transform.SetParent(root,false);var bones=new[]{thigh,calf,foot};mesh.bindposes=bones.Select(b=>b.worldToLocalMatrix*o.transform.localToWorldMatrix).ToArray();
        Save(mesh,"StockingLeg_"+side+".asset");var render=o.AddComponent(typeof(SkinnedMeshRenderer)) as SkinnedMeshRenderer;render.sharedMesh=mesh;render.bones=bones;render.rootBone=thigh.parent;render.sharedMaterial=material;render.updateWhenOffscreen=true;render.quality=SkinQuality.Bone4;render.localBounds=new Bounds(new Vector3(0,.75f,0),new Vector3(3,3,3));
    }

    [MenuItem("XXD/渲染演示/导出丝袜预览")]
    public static void Preview() {StartRecording(true);}
    [MenuItem("XXD/渲染演示/导出丝袜完整帧序列")]
    public static void Record() {StartRecording(false);}
    private static void StartRecording(bool onlyPreview) {
        previousGraphics=GraphicsSettings.renderPipelineAsset;previousQuality=QualitySettings.renderPipeline;
        previousAntiAliasing=QualitySettings.antiAliasing;
        preview=onlyPreview;
        if(Environment.GetEnvironmentVariable("STOCKING_REUSE_SCENE")=="1"){
            EditorSceneManager.OpenScene(ScenePath);player=UnityEngine.Object.FindObjectOfType(typeof(StockingDemoPlayer)) as StockingDemoPlayer;
        }else Build();
        player.autoPlay=false;
        string previewList=Environment.GetEnvironmentVariable("STOCKING_PREVIEW_TIMES");
        if(!string.IsNullOrEmpty(previewList))PreviewTimes=previewList.Split(',').Select(v=>float.Parse(v,System.Globalization.CultureInfo.InvariantCulture)).ToArray();
        recordingStart=0;recordingDuration=StockingDemoPlayer.Duration;
        float value;
        if(float.TryParse(Environment.GetEnvironmentVariable("STOCKING_START"),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out value))recordingStart=value;
        if(float.TryParse(Environment.GetEnvironmentVariable("STOCKING_DURATION"),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out value))recordingDuration=value;
        GraphicsSettings.renderPipelineAsset=player.demoPipeline;QualitySettings.renderPipeline=player.demoPipeline;
        output=Environment.GetEnvironmentVariable("STOCKING_OUTPUT") ?? Path.GetFullPath(".claude/jobs/media/swml-v1/frames");Directory.CreateDirectory(output);
        int width=preview?1280:1920;int height=preview?720:1080;
        target=new RenderTexture(width,height,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);target.antiAliasing=4;target.Create();pixels=new Texture2D(width,height,TextureFormat.RGB24,false,false);
        pullMetrics=new StreamWriter(Path.Combine(output,"pull-metrics.csv"));pullMetrics.WriteLine("time,held,grab_separation,max_separation,knee_bend,comparison,fabric_red,camera_z,net_gallery,decorative_gallery,pattern_type,skirt_visible,hem_min,hem_max,skirt_gripped,waist_error,skirt_palette,hand_active,hand_reach_error,pinch_gap,cloth_hand_error,body_yaw,step_lift,camera_x");
        frame=-20;total=preview?PreviewTimes.Length:Mathf.RoundToInt(recordingDuration*30);EditorApplication.update+=CaptureFrame;
        Debug.Log("[StockingDemo] Recording "+total+" frames to "+output);
    }
    private static void CaptureFrame() {
        try {
            if(frame<0){frame++;return;}
            if(frame>=total){Finish(0);return;}
            float time=preview?PreviewTimes[frame]:recordingStart+frame/30f;player.Sample(time);
            var request=new UniversalRenderPipeline.SingleCameraRequest{destination=target};RenderPipeline.SubmitRenderRequest(player.demoCamera,request);
            var previous=RenderTexture.active;RenderTexture.active=target;pixels.ReadPixels(new Rect(0,0,target.width,target.height),0,0);pixels.Apply(false);RenderTexture.active=previous;
            pullMetrics.WriteLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,"{0:F5},{1},{2:F7},{3:F7},{4:F4},{5},{6:F4},{7:F5},{8},{9},{10:F1},{11},{12:F6},{13:F6},{14},{15:F7},{16},{17},{18:F6},{19:F6},{20:F6},{21:F4},{22:F5},{23:F5}",time,player.elasticPull.IsGripped?1:0,player.elasticPull.GrabSeparation,player.elasticPull.MaxSeparation,player.KneeBend,player.comparison.activeSelf?1:0,player.stocking.GetColor("_FabricColor").r,player.demoCamera.transform.position.z,player.netGallery.activeSelf?1:0,player.decorativeGallery.activeSelf?1:0,player.stocking.GetFloat("_PatternType"),player.skirt.IsVisible?1:0,player.skirt.HemMin,player.skirt.HemMax,player.skirt.IsGripped?1:0,player.skirt.AnchorError,player.skirt.Palette,player.Motion.HandActive?1:0,player.Motion.ReachError,player.Motion.PinchGap,secondsContactError(time),player.Motion.BodyYaw,player.Motion.StepLift,player.demoCamera.transform.position.x));
            string file=preview?"preview_"+time.ToString("00.00",System.Globalization.CultureInfo.InvariantCulture)+".png":"frame_"+frame.ToString("D5")+".jpg";
            File.WriteAllBytes(Path.Combine(output,file),preview?pixels.EncodeToPNG():pixels.EncodeToJPG(96));
            if(frame%90==0)Debug.Log("[StockingDemo] Frame "+frame+"/"+total);frame++;
        } catch(Exception e){Debug.LogException(e);File.WriteAllText(Path.Combine(output,"error.log"),e.ToString());Finish(1);}
    }
    private static float secondsContactError(float time){return time>=104&&time<112?player.skirt.HandContactError:player.elasticPull.HandContactError;}
    private static void Finish(int code) {
        EditorApplication.update-=CaptureFrame;
        if(pullMetrics!=null){pullMetrics.Dispose();pullMetrics=null;}
        GraphicsSettings.renderPipelineAsset=previousGraphics;QualitySettings.renderPipeline=previousQuality;
        QualitySettings.antiAliasing=previousAntiAliasing;
        if(target!=null){target.Release();UnityEngine.Object.DestroyImmediate(target);}if(pixels!=null)UnityEngine.Object.DestroyImmediate(pixels);
        Debug.Log("[StockingDemo] Recording finished code="+code+" frames="+frame);
        if(Application.isBatchMode)EditorApplication.Exit(code);
    }
}
