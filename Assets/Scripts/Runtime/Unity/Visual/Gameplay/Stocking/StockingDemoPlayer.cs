using UnityEngine;
using UnityEngine.Rendering;
using System.Collections.Generic;

namespace XXD.Visual.Unity {
    public sealed class StockingDemoPlayer : MonoBehaviour {
        public Transform character;
        public Transform pelvis;
        public Transform leftThigh;
        public Transform rightThigh;
        public Transform leftCalf;
        public Transform rightCalf;
        public Transform leftFoot;
        public Transform rightFoot;
        public Transform leftArm;
        public Transform rightArm;
        public Camera demoCamera;
        public Light keyLight;
        public Material stocking;
        public StockingElasticPull elasticPull;
        public PleatedSkirtDemo skirt;
        public SkinnedMeshRenderer torsoRenderer,skirtTorsoRenderer;
        public Mesh plainTorsoMesh,skirtTorsoMesh;
        public float HipYaw {get;private set;}
        public GameObject comparison;
        public GameObject netGallery;
        public GameObject decorativeGallery;
        public RenderPipelineAsset demoPipeline;
        public SkinnedMeshRenderer[] legRenderers;
        public bool autoPlay = true;
        public const float Duration = 120f;
        public float KneeBend { get; private set; }
        public GarmentCharacterMotion Motion {get;private set;}
        private Transform[] poseBones;
        private Quaternion[] restRotations;
        private Vector3[] bendAxes;
        private Vector3 pelvisRest;
        private Vector3 feetRest;
        private Quaternion pelvisRotationRest;
        private Vector3 characterRestPosition;
        private float elapsed;
        private RenderPipelineAsset previousGraphicsPipeline;
        private RenderPipelineAsset previousQualityPipeline;
        private bool initialized;
        private int previousAntiAliasing;
        private Mesh contactMesh;
        private sealed class BakedPart {public SkinnedMeshRenderer source;public Mesh mesh;public MeshRenderer renderer;public GameObject node;}
        private readonly List<BakedPart> bakedParts=new List<BakedPart>();
        private void AddBakedPart(SkinnedMeshRenderer source){
            if(source==null)return;
            var node=new GameObject(source.name+"_FramePose");node.hideFlags=HideFlags.DontSave;node.transform.SetParent(source.transform,false);
            var mesh=new Mesh{name="FramePose_"+source.name,hideFlags=HideFlags.DontSave};mesh.MarkDynamic();
            (node.AddComponent(typeof(MeshFilter)) as MeshFilter).sharedMesh=mesh;
            var renderer=node.AddComponent(typeof(MeshRenderer)) as MeshRenderer;renderer.sharedMaterial=source.sharedMaterial;
            source.updateWhenOffscreen=true;bakedParts.Add(new BakedPart{source=source,mesh=mesh,renderer=renderer,node=node});
        }
        private void BakeFramePose(float time){
            foreach(var part in bakedParts){
                bool visible=part.source==torsoRenderer?time<88:part.source==skirtTorsoRenderer?time>=88:part.source!=elasticPull.source||!elasticPull.IsVisible;
                part.renderer.enabled=visible;part.source.enabled=false;
                if(visible){part.source.BakeMesh(part.mesh);part.mesh.RecalculateBounds();}
            }
        }
        private readonly List<Vector3> contactVertices = new List<Vector3>();

        private void OnEnable() {
            previousGraphicsPipeline = GraphicsSettings.renderPipelineAsset;
            previousQualityPipeline = QualitySettings.renderPipeline;
            previousAntiAliasing = QualitySettings.antiAliasing;
            if (demoPipeline != null) {
                GraphicsSettings.renderPipelineAsset = demoPipeline;
                QualitySettings.renderPipeline = demoPipeline;
            }
        }

        private void OnDisable() {
            if (demoPipeline != null) {
                GraphicsSettings.renderPipelineAsset = previousGraphicsPipeline;
                QualitySettings.renderPipeline = previousQualityPipeline;
                QualitySettings.antiAliasing = previousAntiAliasing;
            }
        }

        public void Initialize() {
            if (initialized) return;
            poseBones = new[] { leftThigh, rightThigh, leftCalf, rightCalf, leftFoot, rightFoot, leftArm, rightArm };
            restRotations = new Quaternion[poseBones.Length];
            bendAxes = new Vector3[poseBones.Length];
            for (int i = 0; i < poseBones.Length; i++) {
                restRotations[i] = poseBones[i].localRotation;
                bendAxes[i] = poseBones[i].InverseTransformDirection(character.right);
            }
            pelvisRest = pelvis.localPosition;
            pelvisRotationRest=pelvis.localRotation;characterRestPosition=character.localPosition;
            feetRest = character.InverseTransformPoint((leftFoot.position + rightFoot.position) * .5f);
            Motion=new GarmentCharacterMotion(this);
            AddBakedPart(torsoRenderer);AddBakedPart(skirtTorsoRenderer);foreach(var leg in legRenderers)AddBakedPart(leg);
            initialized = true;
            contactMesh = new Mesh { name = "StockingContactProbe" };
        }

        private void Update() {
            if (!autoPlay) return;
            elapsed += Time.deltaTime;
            Sample(elapsed % Duration);
        }

        private void Bend(int index, float degrees) {
            poseBones[index].localRotation = restRotations[index] * Quaternion.AngleAxis(degrees, bendAxes[index]);
        }

        public void Sample(float seconds) {
            Initialize();
            Motion.ResetPose();
            for (int i = 0; i < poseBones.Length; i++) poseBones[i].localRotation = restRotations[i];
            pelvis.localPosition = pelvisRest;pelvis.localRotation=pelvisRotationRest;
            character.localPosition=characterRestPosition;HipYaw=0;
            character.gameObject.SetActive(true);
            comparison.SetActive(false);
            netGallery.SetActive(false);decorativeGallery.SetActive(false);
            character.localRotation = Quaternion.identity;
            float bend = 0;
            float angle = 0;
            float distance = 3.9f;
            float targetHeight = 1.28f;
            float cameraHeight = 1.55f;
            float focal = 34;
            if(torsoRenderer!=null)torsoRenderer.enabled=seconds<88;
            if(skirtTorsoRenderer!=null)skirtTorsoRenderer.enabled=seconds>=88;
            stocking.SetFloat("_PatternType",0);
            stocking.SetFloat("_Denier", 22);
            stocking.SetColor("_FabricColor", new Color(.023f,.019f,.027f));
            if (seconds < 8) {
                float u = seconds / 8;
                angle = Mathf.Lerp(-22, 24, u);
                distance = 5.5f;
                targetHeight = 1.51f;
                cameraHeight = 1.7f;
                focal = 38;
                if(seconds>6) {
                    float zoom=Mathf.SmoothStep(0,1,(seconds-6)/2);
                    distance=Mathf.Lerp(5.5f,2.45f,zoom);targetHeight=Mathf.Lerp(1.51f,.63f,zoom);cameraHeight=Mathf.Lerp(1.7f,.75f,zoom);focal=Mathf.Lerp(38,40,zoom);
                }
            } else if (seconds < 16) {
                float u=(seconds-8)/8;angle=Mathf.Lerp(24,-30,u);
                targetHeight=.63f;cameraHeight=.75f;distance=2.45f;focal=40;
            } else if (seconds < 24) {
                float u=(seconds-16)/8;angle=Mathf.Lerp(100,150,u);
                targetHeight=.67f;cameraHeight=.78f;distance=1.85f;focal=43;
                bend=27*(.5f-.5f*Mathf.Cos(u*Mathf.PI*4));
            } else if (seconds < 32) {
                float u=(seconds-24)/8;angle=Mathf.Lerp(-45,30,u);
                targetHeight=.18f;cameraHeight=.32f;distance=1.05f;focal=48;
                bend=8*(.5f-.5f*Mathf.Cos(u*Mathf.PI*4));
            } else if (seconds < 40) {
                character.gameObject.SetActive(false);comparison.SetActive(true);
                angle=-2+4*Mathf.Sin((seconds-32)*.4f);targetHeight=.63f;cameraHeight=.75f;distance=3.5f;focal=30;
            } else if (seconds < 48) {
                float u=(seconds-40)/8;angle=Mathf.Lerp(22,-15,u);
                targetHeight=.69f;cameraHeight=.84f;distance=2.65f;focal=38;
                float white=Mathf.SmoothStep(0,1,Mathf.Clamp01((u-.1f)/.45f));
                stocking.SetColor("_FabricColor",Color.Lerp(new Color(.023f,.019f,.027f),new Color(.64f,.62f,.59f),white));stocking.SetFloat("_Denier",Mathf.Lerp(22,32,white));
                bend=10*(.5f-.5f*Mathf.Cos(u*Mathf.PI*2));
            } else if (seconds < 56) {
                angle=-25;targetHeight=.94f;cameraHeight=1.02f;distance=1.55f;focal=40;
            } else if(seconds<64) {
                angle=-28;targetHeight=.46f;cameraHeight=.55f;distance=1.55f;focal=40;
                stocking.SetColor("_FabricColor",new Color(.64f,.62f,.59f));stocking.SetFloat("_Denier",28);
            } else if(seconds<80) {
                character.gameObject.SetActive(false);
                netGallery.SetActive(seconds<72);decorativeGallery.SetActive(seconds>=72);
                angle=2*Mathf.Sin(seconds*.3f);targetHeight=.63f;cameraHeight=.75f;distance=3.5f;focal=30;
            } else if(seconds<88) {
                angle=-25;targetHeight=.94f;cameraHeight=1.02f;distance=1.55f;focal=40;
                stocking.SetFloat("_PatternType",1);stocking.SetFloat("_PatternScale",24);stocking.SetFloat("_PatternWidth",.05f);
            } else if(seconds<96) {
                angle=Mathf.Lerp(-24,22,(seconds-88)/8);distance=5.25f;targetHeight=1.43f;cameraHeight=1.65f;focal=38;
            } else if(seconds<104) {
                angle=Mathf.Lerp(-30,18,(seconds-96)/8);distance=2.1f;targetHeight=1.17f;cameraHeight=1.3f;focal=40;
                stocking.SetFloat("_PatternType",1);stocking.SetFloat("_PatternScale",42);stocking.SetFloat("_PatternWidth",.065f);
            } else if(seconds<112) {
                angle=-25;distance=2.05f;targetHeight=1.16f;cameraHeight=1.3f;focal=40;
                stocking.SetFloat("_PatternType",1);stocking.SetFloat("_PatternScale",24);stocking.SetFloat("_PatternWidth",.05f);
            } else {
                angle=Mathf.Lerp(25,-20,(seconds-112)/8);distance=2.85f;targetHeight=1.20f;cameraHeight=1.4f;focal=38;
                stocking.SetFloat("_PatternType",1);stocking.SetFloat("_PatternScale",24);stocking.SetFloat("_PatternWidth",.05f);
            }
            KneeBend = bend;
            Bend(0,-bend); Bend(1,-bend); Bend(2,bend*2); Bend(3,bend*2); Bend(4,-bend); Bend(5,-bend);
            Motion.ApplyBody(seconds);
            if(GarmentCharacterMotion.IsPull(seconds))KneeBend=Motion.KneeFlex;
            Vector3 feetNow = character.InverseTransformPoint((leftFoot.position + rightFoot.position) * .5f);
            if(!Motion.UsesPlantedFeet)pelvis.position += character.TransformVector(feetRest - feetNow);
            // Validate the deformed sole rather than assuming the imported foot bone's pivot is on the floor.
            if (character.gameObject.activeSelf && legRenderers != null) {
                float soleHeight = float.PositiveInfinity;
                foreach (var render in legRenderers) {
                    render.BakeMesh(contactMesh);
                    contactMesh.GetVertices(contactVertices);
                    foreach (var vertex in contactVertices) soleHeight = Mathf.Min(soleHeight, render.transform.TransformPoint(vertex).y);
                }
                if (!float.IsInfinity(soleHeight)) pelvis.position -= Vector3.up * soleHeight;
            }
            if(elasticPull!=null)elasticPull.PreparePose(seconds);
            if(skirt!=null)skirt.PreparePose(HipYaw);
            Motion.ApplyHands(seconds,elasticPull,skirt);
            stocking.SetFloat("_Bend", bend / 30);
            // Fixed azimuths: changes of view come from the actor's steps, never an orbiting display camera.
            angle=0;
            if(GarmentCharacterMotion.IsPull(seconds)){
                bool calf=seconds>=56&&seconds<64;angle=calf?-52:seconds>=104?-18:-25;
                float zoom=GarmentCharacterMotion.Ease(((seconds%8)-.8f)/1.4f);
                distance=Mathf.Lerp(5.25f,seconds>=104?3.8f:3.9f,zoom);targetHeight=seconds>=104?1.50f:1.40f;cameraHeight=seconds>=104?1.70f:1.60f;focal=38;
            }
            float radians = angle * Mathf.Deg2Rad;
            float focusX=0;
            demoCamera.backgroundColor = seconds < 48 ? new Color(.024f,.031f,.046f) : new Color(.085f,.11f,.145f);
            demoCamera.transform.position = new Vector3(focusX+Mathf.Sin(radians)*distance,cameraHeight,Mathf.Cos(radians)*distance);
            demoCamera.transform.LookAt(new Vector3(focusX,targetHeight,0));
            demoCamera.fieldOfView = focal;
            if (elasticPull != null) elasticPull.Sample(seconds);
            if(skirt!=null)skirt.Sample(seconds,HipYaw);
            BakeFramePose(seconds);
            keyLight.transform.rotation = Quaternion.Euler(36,152,0);
        }

        private void OnDestroy() {
            foreach(var part in bakedParts){if(Application.isPlaying){Destroy(part.mesh);Destroy(part.node);}else{DestroyImmediate(part.mesh);DestroyImmediate(part.node);}}
            if (contactMesh != null) {
                if (Application.isPlaying) Destroy(contactMesh);
                else DestroyImmediate(contactMesh);
            }
        }
    }
}
