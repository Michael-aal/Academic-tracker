(() => {
"use strict";
const $=id=>document.getElementById(id);
let current="0", stored=null, operator=null, waiting=false, expression="", history=[];
const symbols={"+":"+","−":"−","×":"×","÷":"÷"};
function fmt(n){if(!Number.isFinite(n))return "Error";const rounded=Number.parseFloat(n.toPrecision(11));return String(Object.is(rounded,-0)?0:rounded);}
function show(){ $("display").textContent=current;$("expression").textContent=expression||"Ready to calculate";}
function clear(){current="0";stored=null;operator=null;waiting=false;expression="";show();}
function digit(d){if(current==="Error")clear();if(waiting){current=d;waiting=false;}else if(current==="0")current=d;else if(current.length<16)current+=d;show();}
function decimal(){if(current==="Error")clear();if(waiting){current="0.";waiting=false;}else if(!current.includes(".")){current+=".";}show();}
function calculate(a,b,op){switch(op){case "+":return a+b;case "−":return a-b;case "×":return a*b;case "÷":return b===0?NaN:a/b;default:return b;}}
function choose(op){const n=Number(current);if(!Number.isFinite(n))return;if(operator&& !waiting){const result=calculate(stored,n,operator);current=fmt(result);stored=Number(current);if(current==="Error"){operator=null;waiting=true;expression="Cannot divide by zero";show();return;}}else stored=n;operator=op;waiting=true;expression=fmt(stored)+" "+symbols[op];show();}
function equals(){if(!operator||stored===null||current==="Error")return;const left=stored,right=Number(current),op=operator,result=calculate(left,right,op);expression=fmt(left)+" "+symbols[op]+" "+fmt(right)+" =";current=fmt(result);operator=null;stored=null;waiting=true;show();if(current!=="Error")addHistory(expression,current);}
function addHistory(expr,result){history.unshift({expr,result});history=history.slice(0,6);renderHistory();}
function renderHistory(){$("history").innerHTML=history.length?history.map(item=>'<div class="history-item"><span>'+escapeHtml(item.expr)+'</span><strong>'+escapeHtml(item.result)+'</strong></div>').join(""):'<p class="history-empty">Your recent calculations will appear here until you leave this page.</p>';}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function action(name){if(name==="clear"){clear();return;}if(name==="decimal"){decimal();return;}if(name==="equals"){equals();return;}if(name==="sign"){if(current!=="0"&&current!=="Error")current=fmt(-Number(current));show();return;}if(name==="percent"){if(current!=="Error"){current=fmt(Number(current)/100);show();}return;}if(name==="backspace"){if(waiting)return;current=current.length>1?current.slice(0,-1):"0";if(current==="-")current="0";show();}}
$("keys").addEventListener("click",e=>{const btn=e.target.closest("button");if(!btn)return;if(btn.dataset.digit!==undefined)digit(btn.dataset.digit);else if(btn.dataset.op)choose(btn.dataset.op);else if(btn.dataset.action)action(btn.dataset.action);});
document.addEventListener("keydown",e=>{if(/^[0-9]$/.test(e.key)){digit(e.key);return;}if(e.key==="."){decimal();return;}if(e.key==="Enter"||e.key==="="){e.preventDefault();equals();return;}if(e.key==="Escape"){clear();return;}if(e.key==="Backspace"){action("backspace");return;}const ops={"+":"+","-":"−","*":"×","/":"÷"};if(ops[e.key]){e.preventDefault();choose(ops[e.key]);}});
function percentage(){const score=$("score").value,total=$("total").value;if(score===""||total===""||!Number.isFinite(Number(score))||!Number.isFinite(Number(total))||Number(total)<=0||Number(score)<0){$("score-percent").textContent="—";return;}const p=Number(score)/Number(total)*100;$("score-percent").textContent=Number.isFinite(p)?fmt(p)+"%":"—";}
$("score").addEventListener("input",percentage);$("total").addEventListener("input",percentage);$("clear-history").addEventListener("click",()=>{history=[];renderHistory();});$("year-label").textContent=new Date().getFullYear();show();renderHistory();
})();