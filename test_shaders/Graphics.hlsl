/*
BEGIN_SHADER_DECLARATIONS
{
  "Shaders": 
  [
    {
      "ShaderName": "DebugVS",
      "ShaderType": "vs",
      "ShaderModel": "6_5",
      "EntryPoint": "VSMain",
      "Defines": [
        "Define1",
        "Define2"
      ],
      "Optimization": "3",
      "AdditionalArgs": [
        "-HV 2018",
        "-all-resources-bound"
      ]
    },
    {
      "ShaderName": "DebugPS",
      "ShaderType": "ps",
      "ShaderModel": "6_5",
      "EntryPoint": "PSMain",
      "Defines": [
        "Define1",
        "Define2"
      ],
      "Optimization": "3",
      "AdditionalArgs": [
        "-HV 2018",
        "-all-resources-bound"
      ]
    }
  ]
}
END_SHADER_DECLARATIONS
*/

struct VSIn
{
    float4 position : POSITION;
    float4 color : COLOR;
};

struct VSOut
{
    float4 position : SV_Position;
    float4 color : COLOR;
};

struct PSOut
{
    float4 color : SV_Target;
};

cbuffer PerFrame : register(b0)
{
    float4 vertexToScreenPacked;
};

static float2x2 vertexToScreen = {{vertexToScreenPacked[0], vertexToScreenPacked[1]},
                                  {vertexToScreenPacked[2], vertexToScreenPacked[3]}};

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
