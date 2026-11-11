Shader "XXD/Demo/StockingElasticShell" {
 Properties { _FabricColor("Fabric Color",Color)=(.02,.018,.025,1) _Density("Optical Density",Range(0,80))=20
 _PatternType("Pattern",Float)=0 _PatternScale("Pattern Scale",Float)=24 _PatternWidth("Thread Width",Float)=.05 }
 SubShader {
  Tags {"RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent"}
  Pass {
   Tags {"LightMode"="UniversalForward"}
   Blend SrcAlpha OneMinusSrcAlpha
   ZWrite Off Cull Back
   HLSLPROGRAM
   #pragma vertex Vert
   #pragma fragment Frag
   #pragma target 3.0
   #pragma multi_compile _ _ADDITIONAL_LIGHTS
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
   #include "StockingPattern.hlsl"
   CBUFFER_START(UnityPerMaterial)
   half4 _FabricColor;float _Density,_PatternType,_PatternScale,_PatternWidth;
   CBUFFER_END
   struct A {float4 p:POSITION;float3 n:NORMAL;float4 t:TANGENT;float2 uv:TEXCOORD0;float2 patternUV:TEXCOORD1;float4 color:COLOR;};
   struct V {float4 p:SV_POSITION;float3 ws:TEXCOORD0;float3 n:TEXCOORD1;float3 t:TEXCOORD2;float2 uv:TEXCOORD3;float2 strain:TEXCOORD4;float2 patternUV:TEXCOORD5;};
   V Vert(A a) {V o;o.ws=TransformObjectToWorld(a.p.xyz);o.p=TransformWorldToHClip(o.ws);o.n=TransformObjectToWorldNormal(a.n);o.t=TransformObjectToWorldDir(a.t.xyz);o.uv=a.uv;o.patternUV=a.patternUV;o.strain=a.color.rg;return o;}
   half3 Illumination(float3 n,float3 v,float3 t,Light l) {
    float3 h=SafeNormalize(v+l.direction);float nh=saturate(dot(n,h));float th=dot(t,h);
    float nl=saturate(dot(n,l.direction));float glint=exp(-th*th/.055)*pow(nh,30)*.33;
    return (_FabricColor.rgb*(nl*.8+.12)+glint)*l.color*l.distanceAttenuation;
   }
   half4 Frag(V i,FRONT_FACE_TYPE face:FRONT_FACE_SEMANTIC):SV_Target {
    float3 n=normalize(i.n)*IS_FRONT_VFACE(face,1,-1);float3 v=GetWorldSpaceNormalizeViewDir(i.ws);float3 t=normalize(i.t);
    float2 thread=i.uv*float2(155,700);float footprint=max(length(ddx(thread)),length(ddy(thread)));float detail=1-smoothstep(.2,1.0,footprint);
    float weave=sin(thread.x*6.283185)*sin(thread.y*6.283185)*detail;
    float stretch=max(1,i.strain.x);
    float optical=_Density*.041/(sqrt(stretch)*(.45+.55*abs(dot(n,v))));
    float alpha=saturate(1-exp(-optical)+weave*.09);
    if(_PatternType>.5) {
        float mask=StockingPattern(i.patternUV,_PatternType,_PatternScale,_PatternWidth);
        float baseOpacity=_PatternType<2.5?0:.16;
        alpha=lerp(baseOpacity,.94,mask);
    }
    float rim=pow(1-saturate(dot(n,v)),4)*.16;
    half3 light=SampleSH(n)*_FabricColor.rgb+Illumination(n,v,t,GetMainLight());
    #ifdef _ADDITIONAL_LIGHTS
    uint count=GetAdditionalLightsCount();for(uint k=0;k<count;k++)light+=Illumination(n,v,t,GetAdditionalLight(k,i.ws));
    #endif
    return half4(light+rim*.18,alpha);
   }
   ENDHLSL
  }
 }
}
