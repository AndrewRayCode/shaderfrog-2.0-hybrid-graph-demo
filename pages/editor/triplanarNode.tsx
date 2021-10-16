import { shaderNode } from '../nodestuff';

const fireShader = (id: string) =>
  shaderNode(
    id,
    'Triplanar',
    {},
    `
    precision highp float;
    precision highp int;
    
    // Default THREE.js uniforms available to both fragment and vertex shader
    uniform mat4 modelMatrix;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    uniform mat4 viewMatrix;
    uniform mat3 normalMatrix;
    
    // Default uniforms provided by ShaderFrog.
    uniform vec3 cameraPosition;
    uniform float time;
    
    // A uniform unique to this shader. You can modify it to the using the form
    // below the shader preview. Any uniform you add is automatically given a form
    uniform vec3 color;
    uniform vec2 lpxy;
    uniform float lpz;
    
    uniform float tmp;
    uniform float sc;
    
    // Example varyings passed from the vertex shader
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec2 vUv2;
    
    uniform sampler2D iChannel0;
    
    vec2 enlight(vec3 p, vec3 n, vec3 lp)
    {
        vec3 toLight=normalize(lp-p);
        float lamb=clamp(dot(n,toLight),0.0,1.0);
        vec3 rd=normalize(p-cameraPosition);
        vec3 nr=n*dot(n,-rd);
        vec3 refl=normalize(-rd+(nr+rd)*2.0);
        float fresnel=1.0-clamp(dot(n,-rd),0.0,1.0);
        float phong = pow(clamp(dot(refl, toLight),0.0,1.0),20.0);
        phong*=(1.0+fresnel)*lamb;
        return vec2(lamb, phong);
    }
    
    
    void main()
    {
        vec3 lp=vec3(lpxy.x,lpz,lpxy.y);
        
        vec3 p=(modelMatrix*vec4(vPosition, 1.0)).xyz;
        vec3 n=normalize(vec3(modelMatrix*vec4(vNormal,0.0)));
        
        float ns=1.0;
        
        
        vec3 t=p*sc;
        vec3 ts=p*sc*10.;
    
        vec2 tx=vec2(sin(ts.y),sin(ts.z));
        vec2 ty=vec2(sin(ts.x),sin(ts.z));
        vec2 tz=vec2(sin(ts.x),sin(ts.y));
    
        tx=texture2D(iChannel0, t.yz).rg-0.5;
        ty=texture2D(iChannel0, t.xz).rg-0.5;
        tz=texture2D(iChannel0, t.xy).rg-0.5;
    
        //ty=vec2(0.0);
    
        tx*=tmp;    
        ty*=tmp;    
        tz*=tmp;    
    
        if(n.x>0.0)tx=-tx;
        if(n.y<0.0)ty=-ty;
        if(n.z>0.0)tz=-tz;
        
    
        vec3 nx=normalize(n*ns+tx.x*cross(n,vec3(0,0,1))+tx.y*cross(n,vec3(0,1,0)));
        vec3 ny=normalize(n*ns+ty.x*cross(n,vec3(0,0,1))+ty.y*cross(n,vec3(0,1,0)));
        vec3 nz=normalize(n*ns+tz.x*cross(n,vec3(0,1,0))+tz.y*cross(n,vec3(1,0,0)));
     
        vec3 w=abs(n);
        w=vec3(pow(w.x,tmp),pow(w.y,tmp),pow(w.z,tmp));
        w/=dot(w,vec3(1,1,1));
        n=normalize(nx*w.x+ny*w.y+nz*w.z);
    
    /*    
        vec3 toLight=normalize(lp-p);
        float lamb=dot(n,toLight);
        vec3 rd=normalize(p-cameraPosition);
        vec3 nr=n*dot(n,-rd);
        vec3 refl=normalize(-rd+(nr+rd)*2.0);
        float fresnel=1.0-clamp(dot(n,-rd),0.0,1.0);
        float phong = pow(clamp(dot(refl, toLight),0.0,1.0),120.0);
    */
        vec2 l1=enlight(p,n,lp)*0.8;
        vec2 l2=enlight(p,n,vec3(lp.z,lp.y,-lp.x))*0.6;
        vec2 l3=enlight(p,n,-lp)*0.4;
        float lamb=l2.x+l1.x+l3.x;
        float phong=l2.y+l1.y+l3.y;
    
        vec3 rd=normalize(p-cameraPosition);
        vec3 nr=n*dot(n,-rd);
        vec3 refl=normalize(-rd+(nr+rd)*2.0);
        float fresnel=1.0-clamp(dot(n,-rd),0.0,1.0);
    
    //    gl_FragColor=vec4(n*0.5+0.5, 1.0 );return;
    //    gl_FragColor=vec4(fresnel,fresnel,fresnel, 1.0 );return;
    //    gl_FragColor=vec4(bg.rgb, 1.0);return;
        
        gl_FragColor = vec4( lamb*color+(0.3+fresnel*0.5)*(0.6+color*0.3)+phong, 1.0 );
    
    }
`,
    ''
  );

export default fireShader;
