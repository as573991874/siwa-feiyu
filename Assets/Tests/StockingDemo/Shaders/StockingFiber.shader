Shader "XXD/Demo/StockingFiber" {
    Properties {
        _SkinColor("Skin Color", Color) = (0.76,0.49,0.36,1)
        _FabricColor("Fabric Color", Color) = (0.025,0.021,0.028,1)
        _Denier("Optical Density", Range(0,100)) = 22
        _Sheen("Fiber Sheen", Range(0,2)) = 0.55
        _WeaveScale("Weave Frequency", Float) = 210
        _Wrinkle("Wrinkle Strength", Range(0,2)) = 1
        _Bend("Knee Compression", Range(0,1)) = 0
        _PatternType("Pattern: Plain / Net / Lace / Dots / Seam", Float) = 0
        _PatternScale("Pattern Scale", Float) = 24
        _PatternWidth("Thread Width", Float) = .05
    }
    SubShader {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }
        Pass {
            Name "StockingForward"
            Tags { "LightMode"="UniversalForward" }
            Cull Back ZWrite On
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 3.0
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "StockingPattern.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _SkinColor, _FabricColor;
            float _Denier, _Sheen, _WeaveScale, _Wrinkle, _Bend;
            float _PatternType, _PatternScale, _PatternWidth;
            CBUFFER_END
            struct Attributes { float4 positionOS:POSITION; float3 normalOS:NORMAL; float4 tangentOS:TANGENT; float2 uv:TEXCOORD0; float2 patternUV:TEXCOORD1; };
            struct Varyings { float4 positionCS:SV_POSITION; float3 positionWS:TEXCOORD0; float3 normalWS:TEXCOORD1; float3 tangentWS:TEXCOORD2; float2 uv:TEXCOORD3; float4 shadowCoord:TEXCOORD4; float2 patternUV:TEXCOORD5; };
            float Wrinkles(float2 uv) {
                float y=uv.y;
                float ankle=exp(-pow((y-.175)/.052,2));
                float behind=pow(saturate(.5-.5*sin(uv.x*6.283185)),3);
                float knee=exp(-pow((y-.69)/.075,2))*behind*_Bend;
                float phase=y*295 + 1.4*sin(uv.x*6.283185*2) + .6*sin(uv.x*31.4159);
                return (ankle*.65+knee)*(sin(phase)+.35*sin(phase*1.73)) * _Wrinkle;
            }
            Varyings Vert(Attributes a) {
                Varyings o;
                float amount=saturate(_Denier/12);
                a.positionOS.xyz += a.normalOS * Wrinkles(a.uv)*.0015*amount;
                VertexPositionInputs p=GetVertexPositionInputs(a.positionOS.xyz);
                o.positionCS=p.positionCS; o.positionWS=p.positionWS;
                o.normalWS=TransformObjectToWorldNormal(a.normalOS);
                o.tangentWS=TransformObjectToWorldDir(a.tangentOS.xyz);
                o.uv=a.uv; o.patternUV=a.patternUV; o.shadowCoord=GetShadowCoord(p);return o;
            }
            half3 FiberLight(float3 n,float3 v,float3 fiber,float3 albedo,float density,Light light) {
                float3 l=light.direction; float3 h=SafeNormalize(l+v);
                float nl=saturate(dot(n,l));float nv=saturate(dot(n,v));
                float nh=saturate(dot(n,h));
                float longitudinal=dot(fiber,h);
                float3 across=SafeNormalize(cross(n,fiber));
                float transverse=dot(across,h);
                float spec=exp(-longitudinal*longitudinal/0.09-transverse*transverse/0.012)*pow(nh,8);
                float skinSpec=pow(nh,42)*.035;
                float sheen=pow(1-nv,3)*pow(saturate(dot(n,l)*.5+.5),2);
                half3 diff=albedo*(nl*.85+.08);
                half3 shine=(spec*.45+sheen*.18)*_Sheen*lerp(half3(.7,.73,.82),half3(1,1,1),.5)*density+skinSpec;
                return (diff+shine)*light.color*light.distanceAttenuation*lerp(.38,1,light.shadowAttenuation);
            }
            half4 Frag(Varyings i):SV_Target {
                float3 n=normalize(i.normalWS);float3 v=GetWorldSpaceNormalizeViewDir(i.positionWS);
                float3 t=SafeNormalize(i.tangentWS-dot(i.tangentWS,n)*n);float3 b=SafeNormalize(cross(n,t));
                float2 weaveUV=i.uv*float2(_WeaveScale,_WeaveScale*4);
                float footprint=max(length(ddx(weaveUV)),length(ddy(weaveUV)));
                float filter=1-smoothstep(.25,1.05,footprint);
                float2 wave=sin(weaveUV*6.283185);
                float thread=(wave.x*wave.y)*filter;
                float density=saturate(_Denier/18);
                float w0=Wrinkles(i.uv);float wy=(Wrinkles(i.uv+float2(0,.001))-w0);
                n=normalize(n + b*wy*.65*density + (t*wave.x+b*wave.y)*filter*.025*density);
                float nv=saturate(dot(n,v));
                float optical=_Denier*.035/(.34+.66*nv);
                optical+=thread*.045*density;
                optical+=abs(w0)*.1*density;
                float opacity=1-exp(-max(0,optical));
                float toeMask=1-smoothstep(.06,.105,i.uv.y);
                opacity=saturate(opacity+toeMask*.11*density);
                if(_PatternType>.5) {
                    float mask=StockingPattern(i.patternUV,_PatternType,_PatternScale,_PatternWidth);
                    float baseOpacity=_PatternType<2.5?0:.18;
                    opacity=lerp(baseOpacity,.94,mask);
                    density*=lerp(.1,1,mask);
                }
                half3 skin=_SkinColor.rgb*(1+.015*sin(i.uv.y*73)*sin(i.uv.x*51));
                half3 albedo=lerp(skin,_FabricColor.rgb,opacity);
                half3 color=SampleSH(n)*albedo*.75;
                Light main=GetMainLight(i.shadowCoord);
                color+=FiberLight(n,v,b,albedo,density,main);
                #ifdef _ADDITIONAL_LIGHTS
                uint count=GetAdditionalLightsCount();
                for(uint k=0;k<count;k++) { Light l=GetAdditionalLight(k,i.positionWS);color+=FiberLight(n,v,b,albedo,density,l); }
                #endif
                color+=albedo*.045;
                return half4(color,1);
            }
            ENDHLSL
        }
        Pass {
            Name "ShadowCaster" Tags { "LightMode"="ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0 Cull Back
            HLSLPROGRAM
            #pragma vertex ShadowVert
            #pragma fragment ShadowFrag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            float3 _LightDirection;
            float4 ShadowVert(float4 p:POSITION,float3 normal:NORMAL):SV_POSITION {
                float3 positionWS=TransformObjectToWorld(p.xyz);
                float3 normalWS=TransformObjectToWorldNormal(normal);
                float4 clip=TransformWorldToHClip(ApplyShadowBias(positionWS,normalWS,_LightDirection));
                #if UNITY_REVERSED_Z
                clip.z=min(clip.z,UNITY_NEAR_CLIP_VALUE);
                #else
                clip.z=max(clip.z,UNITY_NEAR_CLIP_VALUE);
                #endif
                return clip;
            }
            half4 ShadowFrag():SV_Target { return 0; }
            ENDHLSL
        }
        Pass {
            Name "DepthOnly" Tags { "LightMode"="DepthOnly" }
            ZWrite On ColorMask R Cull Back
            HLSLPROGRAM
            #pragma vertex DepthVert
            #pragma fragment DepthFrag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            float4 DepthVert(float4 p:POSITION):SV_POSITION {return TransformObjectToHClip(p.xyz);}
            half4 DepthFrag():SV_Target{return 0;}
            ENDHLSL
        }
    }
}
