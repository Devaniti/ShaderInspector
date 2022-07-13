/*
BEGIN_SHADER_DECLARATIONS
{
    "Shaders": [
        {
            "ShaderName": "DebugVS",
            "ShaderCompiler": "dxc",
            "ShaderType": "vs",
            "ShaderModel": "6_6",
            "EntryPoint": "VSMain",
            "Defines": [],
            "Optimization": "3",
            "AdditionalArgs": [
                "-HV 2018",
                "-all-resources-bound",
                "-enable-16bit-types"
            ]
        },
        {
            "ShaderName": "DebugPS",
            "ShaderCompiler": "dxc",
            "ShaderType": "ps",
            "ShaderModel": "6_6",
            "EntryPoint": "PSMain",
            "Defines": [],
            "Optimization": "3",
            "AdditionalArgs": [
                "-HV 2018",
                "-all-resources-bound",
                "-enable-16bit-types"
            ]
        },
        {
            "ShaderName": "DebugVS",
            "ShaderCompiler": "fxc",
            "ShaderType": "vs",
            "ShaderModel": "5_0",
            "EntryPoint": "VSMain",
            "Defines": [],
            "Optimization": "3",
            "AdditionalArgs": []
        },
        {
            "ShaderName": "DebugPS",
            "ShaderCompiler": "fxc",
            "ShaderType": "ps",
            "ShaderModel": "5_0",
            "EntryPoint": "PSMain",
            "Defines": [],
            "Optimization": "3",
            "AdditionalArgs": []
        }
    ]
}
END_SHADER_DECLARATIONS
*/

#include "GraphicsHeader.hlsli"

VSOut VSMain(VSIn In)
{
    VSOut Out = (VSOut)0;
    Out.position = float4(mul(In.position.xy, vertexToScreen), 1.0f, 1.0f);
    Out.color = In.color;
    return Out;
}

PSOut PSMain(VSOut In)
{
    PSOut Out = (PSOut)0;
    Out.color = In.color;
    return Out;
}
