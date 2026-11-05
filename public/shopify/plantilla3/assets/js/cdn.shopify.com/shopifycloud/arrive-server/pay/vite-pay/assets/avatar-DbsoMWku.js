function t(t,r){if(!t)return t;if(t.startsWith("data:"))return t;const[n,a]=t.split("?"),e=new URLSearchParams(a??"");return e.set("width",`${r}`),`${n}?${e.toString()}`}export{t as g};
