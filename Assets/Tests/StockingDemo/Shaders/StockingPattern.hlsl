#ifndef XXD_STOCKING_PATTERN_INCLUDED
#define XXD_STOCKING_PATTERN_INCLUDED
float StockingLine(float coordinate,float width) {
    float distance=abs(frac(coordinate+.5)-.5);
    float aa=max(fwidth(coordinate)*.8,.0007);
    return 1-smoothstep(width-aa,width+aa,distance);
}
float StockingPattern(float2 uv,float style,float scale,float width) {
    float2 q=float2(uv.x*max(1,round(scale*.72)),uv.y*scale);
    float diamond=max(StockingLine(q.x+q.y,width),StockingLine(q.x-q.y,width));
    if(style<1.5)return diamond;
    if(style<2.5) {
        float2 cell=frac(q)-.5;
        float radius=length(cell);float angle=atan2(cell.y,cell.x);
        float flower=abs(radius-(.235+.075*cos(angle*6)));
        float aa=max(length(fwidth(q))*.6,.002);
        float petals=1-smoothstep(.023-aa,.023+aa,flower);
        float center=1-smoothstep(.055-aa,.055+aa,radius);
        float vines=StockingLine(q.x+.10*sin(q.y*6.283185),.018);
        return saturate(max(petals,center)+vines*.7+diamond*.2);
    }
    if(style<3.5) {
        float2 cell=frac(q+float2(floor(q.y)*.5,0))-.5;
        float aa=max(length(fwidth(q))*.6,.002);
        return 1-smoothstep(.135-aa,.135+aa,length(cell));
    }
    float seam=1-smoothstep(.004,.007,abs(uv.x-.75));
    float cuff=smoothstep(1.045,1.05,uv.y)*(1-smoothstep(1.09,1.095,uv.y));
    return max(seam,cuff*.8);
}
#endif
