Shader "XXD/Demo/PleatedFabric" {
 Properties {
  _BaseColor("Fabric Color",Color)=(.48,.26,.25,1)
  _StripeColor("Plaid Stripe",Color)=(.13,.10,.12,1)
  _Plaid("Plaid Amount",Range(0,1))=1
 }
 SubShader {
  Tags {"RenderPipeline"="UniversalPipeline" "RenderType"="Opaque"}
  Pass {
   Tags {"LightMode"="UniversalForward"}
   Cull Off ZWrite On
   HLSLPROGRAM
   #pragma vertex Vert
   #pragma fragment Frag
   #pragma target 3.0
   #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
   #pragma multi_compile_fragment _ _SHADOWS_SOFT
   #pragma multi_compile _ _ADDITIONAL_LIGHTS
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
   CBUFFER_START(UnityPerMaterial)
   half4 _BaseColor,_StripeColor;float _Plaid;
   CBUFFER_END
   struct A {float4 p:POSITION;float3 n:NORMAL;float2 uv:TEXCOORD0;};
   struct V {float4 p:SV_POSITION;float3 ws:TEXCOORD0;float3 n:TEXCOORD1;float2 uv:TEXCOORD2;float4 shadow:TEXCOORD3;};
   V Vert(A a){V o;VertexPositionInputs p=GetVertexPositionInputs(a.p.xyz);o.p=p.positionCS;o.ws=p.positionWS;o.n=TransformObjectToWorldNormal(a.n);o.uv=a.uv;o.shadow=GetShadowCoord(p);return o;}
   float Stripe(float x,float width){float d=abs(frac(x+.5)-.5);float aa=max(fwidth(x),.001);return 1-smoothstep(width-aa,width+aa,d);}
   half3 LitFabric(float3 n,float3 v,float3 baseColor,Light l){float3 h=SafeNormalize(v+l.direction);float diffuse=saturate(dot(n,l.direction));float sheen=pow(saturate(dot(n,h)),24)*.085;return (baseColor*(.08+diffuse*.86)+sheen)*l.color*l.distanceAttenuation*lerp(.30,1,l.shadowAttenuation);}
   half4 Frag(V i,FRONT_FACE_TYPE face:FRONT_FACE_SEMANTIC):SV_Target {
    float facing=IS_FRONT_VFACE(face,1,-1);float3 n=normalize(i.n)*facing;float3 v=GetWorldSpaceNormalizeViewDir(i.ws);
    float2 q=i.uv*float2(12,3.2);
    float broad=max(Stripe(q.x,.14),Stripe(q.y,.13));float secondary=max(Stripe(q.x+.25,.035),Stripe(q.y+.25,.035));float fine=max(Stripe(q.x+.40,.009),Stripe(q.y+.40,.009));
    float3 color=lerp(_BaseColor.rgb,_StripeColor.rgb,broad*.62*_Plaid);color=lerp(color,_StripeColor.rgb,secondary*.45*_Plaid);color=lerp(color,float3(.82,.72,.55),fine*.38*_Plaid);
    float hem=smoothstep(.965,.98,i.uv.y);color*=1-hem*.32;
    if(facing<0)color*=.48;
    float3 light=SampleSH(n)*color*.7+LitFabric(n,v,color,GetMainLight(i.shadow));
    #ifdef _ADDITIONAL_LIGHTS
    uint count=GetAdditionalLightsCount();for(uint k=0;k<count;k++)light+=LitFabric(n,v,color,GetAdditionalLight(k,i.ws));
    #endif
    return half4(light+color*.035,1);
   }
   ENDHLSL
  }
  Pass {
   Tags {"LightMode"="ShadowCaster"}
   Cull Off ZWrite On ColorMask 0
   HLSLPROGRAM
   #pragma vertex ShadowVert
   #pragma fragment ShadowFrag
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
   float3 _LightDirection;
   float4 ShadowVert(float4 p:POSITION,float3 normal:NORMAL):SV_POSITION {
    float3 ws=TransformObjectToWorld(p.xyz);float3 n=TransformObjectToWorldNormal(normal);float4 clip=TransformWorldToHClip(ApplyShadowBias(ws,n,_LightDirection));
    #if UNITY_REVERSED_Z
    clip.z=min(clip.z,UNITY_NEAR_CLIP_VALUE);
    #else
    clip.z=max(clip.z,UNITY_NEAR_CLIP_VALUE);
    #endif
    return clip;
   }
   half4 ShadowFrag():SV_Target{return 0;}
   ENDHLSL
  }
 }
}
