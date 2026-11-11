using System.Collections.Generic;
using UnityEngine;

namespace XXD.Visual.Unity {
    // Authored body beats and geometric limb IK for the garment presentation.
    public sealed class GarmentCharacterMotion {
        private readonly StockingDemoPlayer player;
        private readonly Transform[] bones;
        private readonly Quaternion[] rotations;
        private readonly Vector3[] localPositions;
        private readonly Transform spine, chest, head;
        private readonly Arm left, right;
        private readonly Vector3 leftFootRest,rightFootRest;
        private readonly Quaternion leftFootRotation,rightFootRotation;
        public bool UsesPlantedFeet {get;private set;}
        public bool HandActive {get;private set;}
        public float ReachError {get;private set;}
        public float PinchGap {get;private set;}
        public Vector3 PinchPosition {get;private set;}
        public float BodyYaw {get;private set;}
        public float StepLift {get;private set;}
        public float KneeFlex {get;private set;}
        private float poseWeight;
        private bool pullSection;
        private float actionLocal;
        private sealed class Arm {
            public Transform upper,lower,hand,thumbTip,indexTip;
            public Transform[][] fingers;
            public Quaternion[][] rest;
            public Vector3[][] curlAxes;
            public Vector3 localFinger,localPalm;
        }
        private Transform Find(string name) {
            foreach(Transform bone in bones)if(bone.name==name)return bone;
            return null;
        }
        public GarmentCharacterMotion(StockingDemoPlayer owner) {
            player=owner;
            var list=new List<Transform>();
            foreach(Transform t in owner.character.GetComponentsInChildren(typeof(Transform),true))if(t.name.StartsWith("Bip001"))list.Add(t);
            bones=list.ToArray();rotations=new Quaternion[bones.Length];localPositions=new Vector3[bones.Length];
            for(int i=0;i<bones.Length;i++){rotations[i]=bones[i].localRotation;localPositions[i]=bones[i].localPosition;}
            spine=Find("Bip001 Spine");chest=Find("Bip001 Spine1");head=Find("Bip001 Head");
            left=MakeArm("L");right=MakeArm("R");
            leftFootRest=owner.character.InverseTransformPoint(owner.leftFoot.position);rightFootRest=owner.character.InverseTransformPoint(owner.rightFoot.position);
            leftFootRotation=Quaternion.Inverse(owner.character.rotation)*owner.leftFoot.rotation;rightFootRotation=Quaternion.Inverse(owner.character.rotation)*owner.rightFoot.rotation;
        }
        private Arm MakeArm(string side) {
            var a=new Arm{upper=Find("Bip001 "+side+" UpperArm"),lower=Find("Bip001 "+side+" Forearm"),hand=Find("Bip001 "+side+" Hand")};
            a.fingers=new Transform[5][];a.rest=new Quaternion[5][];a.curlAxes=new Vector3[5][];
            a.indexTip=Find("Bip001 "+side+" Finger1Nub");a.thumbTip=Find("Bip001 "+side+" Finger0Nub");
            Vector3 finger=(a.indexTip.position-a.hand.position).normalized;
            Vector3 across=Find("Bip001 "+side+" Finger4").position-Find("Bip001 "+side+" Finger1").position;
            Vector3 palm=Vector3.Cross(finger,across).normalized;if(Vector3.Dot(palm,player.character.forward)<0)palm=-palm;
            a.localFinger=a.hand.InverseTransformDirection(finger);a.localPalm=a.hand.InverseTransformDirection(palm);
            Vector3 axis=Vector3.Cross(finger,palm).normalized;
            for(int f=0;f<5;f++) {
                string prefix="Bip001 "+side+" Finger"+f;
                a.fingers[f]=new[]{Find(prefix),Find(prefix+"1"),Find(prefix+"2")};a.rest[f]=new Quaternion[3];a.curlAxes[f]=new Vector3[3];
                for(int j=0;j<3;j++){a.rest[f][j]=a.fingers[f][j].localRotation;a.curlAxes[f][j]=a.fingers[f][j].InverseTransformDirection(axis);}
            }
            return a;
        }
        public void ResetPose() {
            for(int i=0;i<bones.Length;i++){bones[i].localRotation=rotations[i];bones[i].localPosition=localPositions[i];}
            HandActive=false;ReachError=0;PinchGap=0;UsesPlantedFeet=false;StepLift=0;KneeFlex=0;
        }
        public static float Ease(float x) {x=Mathf.Clamp01(x);return x*x*x*(x*(x*6-15)+10);}
        public static bool IsPull(float t) {return (t>=48&&t<64)||(t>=80&&t<88)||(t>=104&&t<112);}
        private void Rotate(Transform bone,Vector3 axis,float degrees) {bone.rotation=Quaternion.AngleAxis(degrees,axis)*bone.rotation;}
        private void LegBend(Transform upper,Transform lower,Transform foot,float bend) {
            Rotate(upper,player.character.right,-bend);Rotate(lower,player.character.right,bend*2);Rotate(foot,player.character.right,-bend);
        }
        public void ApplyBody(float t) {
            pullSection=IsPull(t);actionLocal=t%8;
            BodyYaw=0;poseWeight=0;
            float breath=Mathf.Sin(t*1.8f);
            Rotate(chest,player.character.right,breath*.65f);
            if(pullSection) {
                poseWeight=Ease(actionLocal/1.2f)*(1-Ease((actionLocal-6)/1.8f));
                bool calf=t>=56&&t<64;bool skirt=t>=104;
                float crouch=(skirt?32:40)*poseWeight;
                if(!skirt){
                    UsesPlantedFeet=true;
                    float thigh=calf?100:40,knee=calf?105:50;
                    Rotate(player.leftThigh,player.character.right,-thigh*poseWeight);Rotate(player.leftCalf,player.character.right,knee*poseWeight);Rotate(player.leftFoot,player.character.right,(thigh-knee)*poseWeight);
                    LegBend(player.rightThigh,player.rightCalf,player.rightFoot,4*poseWeight);
                    player.pelvis.position+=player.character.right*(.035f*poseWeight);KneeFlex=knee*poseWeight;
                }else{crouch=8*poseWeight;LegBend(player.leftThigh,player.leftCalf,player.leftFoot,crouch);LegBend(player.rightThigh,player.rightCalf,player.rightFoot,crouch);KneeFlex=crouch*2;}
                float pulling=Ease(Mathf.InverseLerp(1.5f,3f,actionLocal));
                float lean=(calf?60:skirt?18+34*(1-pulling):60+5*(1-pulling))*poseWeight;
                Rotate(spine,player.character.right,lean*.45f);Rotate(chest,player.character.right,lean*.55f);
                if(!calf)Rotate(spine,player.character.forward,(skirt?6+18*(1-pulling):16+8*(1-pulling))*poseWeight);
                Rotate(head,player.character.right,13*poseWeight);
                BodyYaw=skirt?8:-7;player.character.localRotation=Quaternion.Euler(0,BodyYaw,0);
            } else if(t<16 || (t>=40&&t<48) || t>=88) {
                UsesPlantedFeet=true;
                float local=t%8;
                float start=-18,end=28;
                if(t>=8&&t<16){start=28;end=-20;}
                if(t>=40&&t<48){start=12;end=-24;}
                if(t>=88&&t<96){start=-20;end=46;}
                if(t>=96&&t<104){start=22;end=-26;}
                if(t>=112){start=-22;end=32;}
                // Two distinct steps with a planted interval; torso leads before each foot follows.
                float first=Ease((local-.7f)/1.35f),second=Ease((local-2.35f)/1.35f);
                float turn=(first+second)*.5f;BodyYaw=Mathf.Lerp(start,end,turn);
                player.character.localRotation=Quaternion.Euler(0,BodyYaw,0);
                player.pelvis.position+=new Vector3(.024f*Mathf.Sin(local*1.1f),-.018f-.013f*Mathf.Sin(turn*Mathf.PI),0);
                float lead=Mathf.Sin(turn*Mathf.PI)*Mathf.Sign(end-start)*7;
                Rotate(chest,player.character.up,lead);Rotate(head,player.character.up,lead*.5f);
                Vector3 l=FootTarget(leftFootRest,start,end,first,local,.7f),r=FootTarget(rightFootRest,start,end,second,local,2.35f);
                Solve(player.leftThigh,player.leftCalf,player.leftFoot,l,player.character.TransformPoint(new Vector3(-.22f,.55f,.65f)));
                Solve(player.rightThigh,player.rightCalf,player.rightFoot,r,player.character.TransformPoint(new Vector3(.22f,.55f,.65f)));
                player.leftFoot.rotation=player.character.parent.rotation*Quaternion.Euler(0,Mathf.Lerp(start,end,first),0)*leftFootRotation;
                player.rightFoot.rotation=player.character.parent.rotation*Quaternion.Euler(0,Mathf.Lerp(start,end,second),0)*rightFootRotation;
                float settle=Ease((local-4.4f)/1.8f);Rotate(chest,player.character.up,-7*settle);
            } else if(t>=16&&t<24) {BodyYaw=-130;player.character.localRotation=Quaternion.Euler(0,BodyYaw,0);}
            else if(t>=24&&t<32){BodyYaw=-12;player.character.localRotation=Quaternion.Euler(0,BodyYaw,0);}
        }
        private Vector3 FootTarget(Vector3 rest,float start,float end,float progress,float local,float liftStart) {
            Vector3 p=Vector3.Lerp(Quaternion.Euler(0,start,0)*rest,Quaternion.Euler(0,end,0)*rest,progress);
            float u=Mathf.Clamp01((local-liftStart)/1.35f);float lift=.065f*Mathf.Sin(u*Mathf.PI);p.y+=lift;StepLift=Mathf.Max(StepLift,lift);
            return player.character.parent.TransformPoint(p);
        }
        private void Fingers(Arm arm,float close) {
            for(int f=0;f<5;f++)for(int j=0;j<3;j++) {
                float degrees=f==0?0:(f==1?new[]{58f,75f,40f}[j]:new[]{44f,63f,34f}[j]);
                arm.fingers[f][j].localRotation=arm.rest[f][j]*Quaternion.AngleAxis(degrees*Mathf.Lerp(.25f,1,close),arm.curlAxes[f][j]);
            }
            if(close>.01f) {
                Vector3 target=arm.indexTip.position+arm.hand.TransformDirection(arm.localPalm)*.006f;
                for(int iteration=0;iteration<10;iteration++)for(int j=2;j>=0;j--){var joint=arm.fingers[0][j];Quaternion q=Quaternion.FromToRotation(arm.thumbTip.position-joint.position,target-joint.position);joint.rotation=Quaternion.RotateTowards(Quaternion.identity,q,30*close)*joint.rotation;}
            }
        }
        private Vector3 Pinch(Arm arm) {return (arm.indexTip.position+arm.thumbTip.position)*.5f;}
        public void ApplyHands(float t,StockingElasticPull elastic,PleatedSkirtDemo skirt) {
            float swing=pullSection?0:Mathf.Sin(t*1.1f)*2.5f;
            Rotate(left.upper,player.character.forward,65+swing);Rotate(right.upper,player.character.forward,-65+swing);
            Rotate(left.lower,player.character.right,7);Rotate(right.lower,player.character.right,7);
            Fingers(left,0);Fingers(right,0);
            if(!pullSection)return;
            bool isSkirt=t>=104;
            Vector3 target=isSkirt?skirt.DesiredHandPosition(t):elastic.DesiredHandPosition(t);
            // Pick the arm on the garment's side rather than relying on mirrored bone names.
            Arm arm=Vector3.Dot(target-player.pelvis.position,player.character.right)<0?left:right;
            float reach=Ease(actionLocal/1.4f)*(1-Ease((actionLocal-5.2f)/1.5f));
            float close=Ease((actionLocal-1.05f)/.4f)*(1-Ease((actionLocal-4.6f)/.45f));
            Fingers(arm,close);
            Vector3 palm=player.character.forward;
            Vector3 pinchAxis=arm.hand.InverseTransformDirection(Pinch(arm)-arm.hand.position).normalized;
            Vector3 reachDirection=(target-arm.upper.position).normalized;
            Quaternion orientation=Quaternion.LookRotation(reachDirection,palm)*Quaternion.Inverse(Quaternion.LookRotation(pinchAxis,arm.localPalm));
            orientation=Quaternion.Slerp(arm.hand.rotation,orientation,reach);
            Vector3 pinchLocal=arm.hand.InverseTransformPoint(Pinch(arm));
            Vector3 wrist=target-orientation*Vector3.Scale(pinchLocal,arm.hand.lossyScale);
            wrist=Vector3.Lerp(arm.hand.position,wrist,reach);
            float side=arm==left?-1:1;
            Solve(arm.upper,arm.lower,arm.hand,wrist,player.character.TransformPoint(new Vector3(side*.8f,1.25f,.38f)));
            arm.hand.rotation=orientation;
            if(Mathf.Abs(actionLocal-3.5f)<.001f)Debug.Log("[GarmentHand] t="+t+" target="+target.ToString("F4")+" wrist="+wrist.ToString("F4")+" shoulder="+arm.upper.position.ToString("F4")+" pinch="+Pinch(arm).ToString("F4")+" armLengths="+Vector3.Distance(arm.upper.position,arm.lower.position)+","+Vector3.Distance(arm.lower.position,arm.hand.position)+" scale="+arm.hand.lossyScale);
            PinchPosition=Pinch(arm);PinchGap=Vector3.Distance(arm.indexTip.position,arm.thumbTip.position);
            HandActive=actionLocal>=1.5f&&actionLocal<4.6f;
            ReachError=HandActive?Vector3.Distance(PinchPosition,target):0;
            if(isSkirt){skirt.handAnchorWorld=PinchPosition;skirt.useHandAnchor=true;}
            else{elastic.handAnchorWorld=PinchPosition;elastic.useHandAnchor=true;}
        }
        public static void Solve(Transform upper,Transform lower,Transform tip,Vector3 target,Vector3 pole) {
            Vector3 origin=upper.position;float a=Vector3.Distance(origin,lower.position),b=Vector3.Distance(lower.position,tip.position);
            Vector3 delta=target-origin;float distance=Mathf.Clamp(delta.magnitude,Mathf.Abs(a-b)+.001f,a+b-.001f);Vector3 direction=delta.normalized;
            Vector3 bend=Vector3.ProjectOnPlane(pole-origin,direction).normalized;if(bend.sqrMagnitude<.1f)bend=Vector3.Cross(direction,Vector3.right).normalized;
            float along=(a*a-b*b+distance*distance)/(2*distance);Vector3 elbow=origin+direction*along+bend*Mathf.Sqrt(Mathf.Max(0,a*a-along*along));
            upper.rotation=Quaternion.FromToRotation(lower.position-origin,elbow-origin)*upper.rotation;
            lower.rotation=Quaternion.FromToRotation(tip.position-lower.position,target-lower.position)*lower.rotation;
        }
    }
}
