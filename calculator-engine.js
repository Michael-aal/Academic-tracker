"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CalculatorEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FUNCTIONS = new Set(["sin","cos","tan","asin","acos","atan","sinh","cosh","tanh","sqrt","cbrt","abs","ln","log","log10","exp","floor","ceil","round","fact","min","max","pow"]);
  function tokenize(source) {
    const input = String(source).replace(/[×]/g,"*").replace(/[÷]/g,"/").replace(/[−]/g,"-").replace(/π/g,"pi").replace(/\s+/g,"");
    if (!input || input.length > 240) throw new Error("Enter a calculation first.");
    const tokens=[]; let i=0;
    while(i<input.length){
      const rest=input.slice(i);
      const n=/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
      if(n){const value=Number(n[0]);if(!Number.isFinite(value))throw new Error("That number is too large.");tokens.push({type:"number",value});i+=n[0].length;continue;}
      const id=/^[a-z]+/i.exec(rest);
      if(id){tokens.push({type:"identifier",value:id[0].toLowerCase()});i+=id[0].length;continue;}
      const ch=input[i];
      if("+-*/^()%!, ".includes(ch)){tokens.push({type:ch==="("||ch===")"||ch===","?ch:"operator",value:ch});i++;continue;}
      throw new Error("Check the expression and try again.");
    }
    const expanded=[];
    for(let j=0;j<tokens.length;j++){
      const a=tokens[j], b=tokens[j+1]; expanded.push(a);
      if(!b)continue;
      const aEnds=a.type==="number"||a.type===")"||(a.type==="identifier"&&!(FUNCTIONS.has(a.value)&&b.type==="("));
      const bStarts=b.type==="number"||b.type==="("||b.type==="identifier";
      if(aEnds&&bStarts)expanded.push({type:"operator",value:"*"});
    }
    return expanded;
  }
  function evaluate(source, options={}) {
    const tokens=tokenize(source); let pos=0;
    const angle=options.angleMode==="RAD"?"RAD":"DEG";
    const peek=()=>tokens[pos], take=()=>tokens[pos++];
    const finite=v=>{if(!Number.isFinite(v))throw new Error("This calculation is outside the supported range.");return Object.is(v,-0)?0:v;};
    const toRad=x=>angle==="DEG"?x*Math.PI/180:x;
    const fromRad=x=>angle==="DEG"?x*180/Math.PI:x;
    function call(name,args){
      const a=args[0];
      if(["sin","cos","tan"].includes(name)&&args.length===1)return finite(Math[name](toRad(a)));
      if(["asin","acos","atan"].includes(name)&&args.length===1)return finite(fromRad(Math[name](a)));
      if(["sinh","cosh","tanh","sqrt","cbrt","abs","exp","floor","ceil","round","log10"].includes(name)&&args.length===1)return finite(Math[name](a));
      if(name==="ln"&&args.length===1)return finite(Math.log(a));
      if(name==="log"&&(args.length===1||args.length===2))return finite(args.length===1?Math.log10(a):Math.log(a)/Math.log(args[1]));
      if(name==="fact"&&args.length===1)return factorial(a);
      if(name==="pow"&&args.length===2)return finite(Math.pow(args[0],args[1]));
      if((name==="min"||name==="max")&&args.length>=1)return finite(Math[name](...args));
      throw new Error("Check the function name and number of values.");
    }
    function factorial(n){if(!Number.isInteger(n)||n<0||n>170)throw new Error("Factorial needs a whole number from 0 to 170.");let v=1;for(let i=2;i<=n;i++)v*=i;return finite(v);}
    function expression(){let v=term();while(peek()?.type==="operator"&&["+","+ -".trim()].includes(peek().value)){const op=take().value;const r=term();v=finite(op==="+"?v+r:v-r);}return v;}
    function term(){let v=unary();while(peek()?.type==="operator"&&["*","/"].includes(peek().value)){const op=take().value,r=unary();if(op==="/"&&r===0)throw new Error("You can't divide by zero.");v=finite(op==="*"?v*r:v/r);}return v;}
    function unary(){if(peek()?.type==="operator"&&["+","+ -".trim()].includes(peek().value)){const op=take().value,v=unary();return op==="-"?-v:v;}return power();}
    function power(){let v=postfix();if(peek()?.type==="operator"&&peek().value==="^"){take();v=finite(Math.pow(v,unary()));}return finite(v);}
    function postfix(){let v=primary();while(peek()?.type==="operator"&&(peek().value==="%"||peek().value==="!")){const op=take().value;v=op==="%"?v/100:factorial(v);}return finite(v);}
    function primary(){
      const t=peek();if(!t)throw new Error("Finish the expression before calculating.");
      if(t.type==="number"){take();return t.value;}
      if(t.type==="("){take();const v=expression();if(peek()?.type!==")")throw new Error("Add the missing closing bracket.");take();return v;}
      if(t.type==="identifier"){
        take();const name=t.value;
        if(peek()?.type==="("){
          if(!FUNCTIONS.has(name))throw new Error("Unknown scientific function: "+name+".");
          take();const args=[];
          if(peek()?.type!==")"){args.push(expression());while(peek()?.type===","){take();args.push(expression());}}
          if(peek()?.type!==")")throw new Error("Add the missing closing bracket.");take();return call(name,args);
        }
        if(name==="pi")return Math.PI;if(name==="e")return Math.E;
        throw new Error("Unknown constant or function: "+name+".");
      }
      throw new Error("Check the expression and try again.");
    }
    const result=expression();if(pos!==tokens.length)throw new Error("Check the expression and try again.");return finite(result);
  }
  function format(value){if(!Number.isFinite(value))throw new Error("This calculation is outside the supported range.");if(Object.is(value,-0))value=0;return Number.parseFloat(value.toPrecision(12)).toString();}
  return {evaluate,format};
});
