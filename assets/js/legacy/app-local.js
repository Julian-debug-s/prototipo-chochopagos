var DOM=3000,STORE='chochopagos-demo-v1';
var CAT=[['Servicios públicos','💡'],['Recargas','📱'],['Pagos y bancos','🏦'],['Trámites','📄'],['Giros','💸']];
/* [cat, nombre, icono, comisión, valor fijo|null, etiqueta de referencia] */
var SV=[
[0,'Energía (EPM)','💡',1500,null,'N.º de contrato o factura'],
[0,'Acueducto','🚰',1500,null,'N.º de matrícula o factura'],
[0,'Gas domiciliario','🔥',1500,null,'N.º de cuenta'],
[0,'Internet / TV','📡',1500,null,'N.º de cuenta'],
[1,'Recarga a celular','📱',500,null,'N.º de celular'],
[1,'Paquete de datos','📶',500,null,'N.º de celular'],
[2,'Consignación bancaria','🏦',2500,null,'Banco y N.º de cuenta'],
[2,'Pago de tarjeta o crédito','💳',2000,null,'N.º de obligación'],
[2,'Cuota de cooperativa','🤝',1500,null,'N.º de asociado'],
[3,'SOAT','🛵',5000,null,'Placa del vehículo'],
[3,'Impuesto predial / vehicular','🏠',5000,null,'Matrícula o placa'],
[3,'Copia de registro civil','📄',6000,10000,'Nombre de la persona'],
[3,'Autorización o reclamo EPS','💊',8000,0,'EPS y N.º de documento'],
[4,'Envío de giro','💸',3000,null,'Nombre y celular de quien recibe']];
var LB=['Solicitado','En camino','Efectivo recogido','Pagado','Entregado','Cancelado','Pago rechazado','Pago pendiente'];
var MSG=['Recibimos tu pedido. Carlos te confirmará pronto.','Carlos va en camino a tu casa 🏍️','Recogimos tu efectivo y factura. Estamos haciendo el trámite.','¡Trámite realizado! Te llevamos el comprobante.','Comprobante entregado. ¡Gracias por confiar en ChochoPagos!','Este pedido fue cancelado antes de recibir el efectivo.','El proveedor rechazó el pago. Revisa los datos o solicita ayuda.','El proveedor aún no confirma el pago. El Centro hará seguimiento.'];
var AC={mon:'Saldo',pagos:'Tus pagos',efectivo:'Efectivo en mano',ganancia:'Ganancias',plat:'Saldo plataforma',caja:'Caja del Centro',com:'Comisiones'};
var HINT0={u:'USUARIO (Doña Rosa, por WhatsApp): elige el trámite de una lista, ve el desglose de valores, sigue el pedido y consulta sus movimientos.',
d:'DOMICILIARIO (Carlos): gestiona pedidos, maneja el efectivo que recoge, rinde caja al Centro y ve sus ganancias. Activa “sin señal” para ver el modo offline.',
c:'CENTRO COMUNITARIO (tienda aliada): cola de pagos, saldo de plataforma, caja, comisiones, tarifario y todos los movimientos.',
a:'Los tres roles a la vez: haz un pedido a la izquierda y síguelo en los otros dos.'};
var S;
var SECT=['Alto del Chocho','Vereda vecina'];
function esc(x){return String(x).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}
function getU(id){return S.users.filter(function(u){return u.cel===id})[0]||{name:'',sector:'',dir:''}}
function fn(u){return u.name.split(' ')[0]}
function f(x){return '$'+x.toLocaleString('es-CO')}
function hh(t){return new Date(t).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}
function el(i){return document.getElementById(i)}
function dm(o){return o.self?0:DOM}
function tot(o){return o.m+o.fee+dm(o)}
function nm(o){return o.provider?SV[o.sv][1]+' - '+o.provider:SV[o.sv][1]}
function mv(role,acct,concept,amt,ord,who,t){S.L.push({role:role,acct:acct,concept:concept,amt:amt,ord:ord,who:who||'',t:t||Date.now()})}
function bal(acct,who){return S.L.filter(function(l){return l.acct===acct&&(!who||l.who===who)}).reduce(function(a,l){return a+l.amt},0)}
function persistDemo(){ChochoStorage.save(STORE,S)}
function restoreDemo(){var saved=ChochoStorage.load(STORE);if(saved)Object.keys(saved).forEach(function(k){S[k]=saved[k]});ChochoSync.ensure(S);S.v=newV();S.listening=false;S.vb=false}
function queueOrder(o){ChochoSync.queue(S,o)}
function collect(o,t){o.s=2;var w=o.uid;
if(o.sv!==14&&o.m>0)mv('u','pagos','Pago de '+nm(o)+' #'+o.id,-o.m,o.id,w,t);
if(o.fee>0)mv('u','pagos','Comisión del servicio #'+o.id,-o.fee,o.id,w,t);
mv('u','pagos','Domicilio #'+o.id,-DOM,o.id,w,t);
mv('d','efectivo','Efectivo recibido de '+o.u+' #'+o.id,tot(o),o.id,'',t)}
function pay(o,w,t){if(o.sv!==14&&bal('plat')<o.m){toast('Saldo de plataforma insuficiente. Recarga en el Centro.');return false}
o.s=3;o.by=w;
if(o.sv===14)mv('u','mon','Recarga de saldo #'+o.id,o.m,o.id,o.uid,t);
else{if(o.m>0)mv('c','plat','Pago de '+nm(o)+' #'+o.id,-o.m,o.id,'',t);if(o.fee>0)mv('c','com','Comisión #'+o.id+' ('+nm(o)+')',o.fee,o.id,'',t)}
if(w==='centro'){var x=o.m+o.fee;o.rend=true;S.papel=Math.max(0,S.papel-1);
mv('d','efectivo','Entrega de efectivo al Centro #'+o.id,-x,o.id,'',t);
mv('c','caja','Efectivo recibido de Carlos #'+o.id,x,o.id,'',t)}
return true}
function processPay(o,w){var result=S.inp['result'+o.id]||'approved';
if(result==='rejected'){o.s=6;o.failure='El proveedor rechazó la operación en esta simulación.';return 'rejected'}
if(result==='pending'){o.s=7;o.failure='El proveedor dejó la operación pendiente de confirmación.';return 'pending'}
return pay(o,w)?'approved':'unavailable'}
function deliver(o,t){o.s=4;o.t1=t||Date.now();
mv('d','efectivo','Domicilio #'+o.id+' pasa a tus ganancias',-DOM,o.id,'',t);
mv('d','ganancia','Ganancia por domicilio #'+o.id,DOM,o.id,'',t)}
function evidence(file,id){var o=oid(id);if(!file||!o||o.s!==3)return;o.evidence=URL.createObjectURL(file);deliver(o);toast('Evidencia guardada. Pedido entregado.');render()}
function pend(){return S.orders.filter(function(o){return o.by==='app'&&!o.rend&&o.s>=3})}
function init(){var n=Date.now();
S={tab:'u',ut:'p',dt:'p',on:true,sync:{pending:0,last:n,status:'synced'},orderView:null,papel:120,cat:0,svc:null,amt:'',ref:'',id:4,L:[],mode:'login',me:null,op:false,ce:false,
f:{cel:'',pin:'',pin2:'',name:'',ced:'',sector:'Alto del Chocho',dir:'',ok:false,opc:'',opp:'',cc:'',ccp:''},
users:[{name:'Rosa Giraldo',ced:'43987654',cel:'3128889900',sector:'Alto del Chocho',dir:'Finca La Esperanza, junto a la droguería',pin:'1234'},
{name:'Jairo Henao',ced:'70123456',cel:'3104567890',sector:'Alto del Chocho',dir:'Casa azul frente a la escuela',pin:'1234'}],
orders:[
{id:1,u:'Rosa',uid:'3128889900',sv:0,ref:'Contrato 4471290',m:85000,fee:1500,s:1,scan:false,code:'4821',arr:false,chk:false,t0:n-12*6e4,t1:0,by:'',rend:false},
{id:2,u:'Jairo',uid:'3104567890',sv:4,ref:'3104567890',m:20000,fee:500,s:0,scan:false,code:'7310',arr:false,chk:false,t0:n-3*6e4,t1:0,by:'',rend:false},
{id:3,u:'Rosa',uid:'3128889900',sv:4,ref:'3128889900',m:30000,fee:500,s:0,scan:true,code:'0000',arr:true,chk:true,t0:n-40*6e4,t1:0,by:'',rend:false}]};
S.inp={};S.opSeen={};S.orders.forEach(function(o){S.opSeen[o.id]=1});S.rcash=0;S.faces={};S.facePic={};S.f.spin='';S.f.rcel='';S.f.ramt='';S.f.rok=false;S.f.ccel='';S.f.camt='';S.f.cok=false;S.vmsg='';S.voice=true;S.listening=false;S.vb=false;S.seen={};S.v=newV();
mv('c','plat','Saldo inicial de la plataforma',500000,0,'',n-90*6e4);
var o=S.orders[2];collect(o,n-35*6e4);pay(o,'app',n-30*6e4);deliver(o,n-22*6e4);mv('u','mon','Saldo inicial del monedero (demo)',50000,0,'3128889900',n-120*6e4);restoreDemo()}
init();
function toast(m){var t=el('toast');t.textContent=m;t.className='s';clearTimeout(toast.h);toast.h=setTimeout(function(){t.className=''},2400)}
function trk(s){var h='<div class="trk">',active=s>=5?-1:s;for(var i=0;i<5;i++)h+='<i class="'+(i<=active?'d':'')+'"></i>';return h+'</div>'}
function by(o){return o.by==='monedero'?'Monedero (autopago)':o.by==='app'?'App del domiciliario':o.by==='centro'?'Centro Comunitario':'—'}
function recibo(o){return '<div class="recibo">'+(o.photo?'<img class="rth" alt="Recibo del trámite" src="'+o.photo+'"><br>':'')+(o.evidence?'<b>Evidencia de entrega</b><img class="rth" alt="Evidencia de entrega" src="'+o.evidence+'"><br>':'')+'COMPROBANTE #'+o.id+'<br>'+nm(o)+'<br>Ref: '+o.ref+'<br>Valor: '+f(o.m)+' · Comisión: '+f(o.fee)+'<br>Domicilio: '+f(dm(o))+'<br><b>Total: '+f(tot(o))+'</b><br>Vía: '+by(o)+' · CHO-'+(2600+o.id)+'</div>'}
function orderDetail(o,close){var h='<div class="card order-detail"><div class="row"><b>Pedido #'+o.id+'</b><span class="pill p'+o.s+'">'+LB[o.s]+'</span></div><div class="mut">'+nm(o)+' · Ref: '+esc(o.ref)+'</div>'+trk(o.s)+'<div class="st">'+LB[o.s]+'</div>';
h+=(o.s===6||o.s===7?'<p class="mut">'+esc(o.failure||'El Centro está revisando esta operación.')+'</p>':'')+'<div class="row"><span>Valor del trámite</span><span>'+f(o.m)+'</span></div><div class="row"><span>Comisión</span><span>'+f(o.fee)+'</span></div><div class="row"><span>Domicilio</span><span>'+f(dm(o))+'</span></div><div class="row t"><span>Total</span><span>'+f(tot(o))+'</span></div>';
if(!o.self&&o.s<2)h+='<div class="mut" style="margin-top:6px">Carlos llega en unos '+(10+(o.id%3)*5)+' min</div>'+(o.code?'<div class="recibo" style="text-align:center">Código de entrega<br><b style="font-size:26px">'+o.code+'</b><br>Díselo a Carlos cuando le entregues el efectivo</div>':'')+'<button class="btn sec" data-a="cancel" data-i="'+o.id+'">Cancelar pedido</button>';
if(o.s===3||o.s===4)h+=recibo(o);
return h+(close?'<button class="btn sec" data-a="closeOrder">Cerrar detalle</button>':'')+'</div>'}
function activeOrder(o){return o.s<3||o.s===7}
function historyOrder(o){return o.s>=3&&o.s!==7}
function orderHistory(mine){var h='<h4>'+(S.ut==='h'?'Historial y facturas anteriores':'Pedidos activos')+'</h4><p class="mut">'+(S.ut==='h'?'Tus comprobantes completos aparecen aquí.':'Selecciona un pedido para consultar su comprobante y seguimiento.')+'</p>';
if(S.ut==='h'){mine.forEach(function(o){h+=orderDetail(o,false)});return h}
mine.forEach(function(o){h+='<div class="card history-row"><div><b>'+SV[o.sv][2]+' '+nm(o)+'</b><div class="mut">Pedido #'+o.id+' · '+f(tot(o))+'</div></div><span class="pill p'+o.s+'">'+LB[o.s]+'</span><button class="btn sm" data-a="order" data-i="'+o.id+'">Ver detalle</button></div>'});
var focus=mine.filter(function(o){return o.id===S.orderView})[0];return h+(focus?orderDetail(focus,true):'')}
function led(role,who,n){var r=S.L.filter(function(l){return l.role===role&&(!who||l.who===who)}).slice().reverse().slice(0,n||40);
if(!r.length)return '<div class="card mut">Sin movimientos todavía.</div>';
return '<div class="card" style="padding:4px 12px">'+r.map(function(l){return '<div class="mvr"><div><b>'+l.concept+'</b><div class="mut">'+hh(l.t)+' · '+AC[l.acct]+'</div></div><span class="'+(l.amt<0?'neg':'pos')+'">'+(l.amt<0?'−':'+')+f(Math.abs(l.amt))+'</span></div>'}).join('')+'</div>'}
function nav(k,cur,items){return '<div class="nav">'+items.map(function(i){return '<button class="'+(cur===i[0]?'on':'')+'" data-a="'+k+'" data-i="'+i[0]+'">'+i[1]+'</button>'}).join('')+'</div>'}
function splash(sub){return '<div class="splash"><div class="logo">💸</div><b>ChochoPagos</b><small>'+sub+'</small></div>'}
function inp(id,label,type,ph,ex){return '<label for="f_'+id+'">'+label+'</label><input id="f_'+id+'" data-f="'+id+'" type="'+type+'" placeholder="'+ph+'" value="'+esc(S.f[id]||'')+'" autocomplete="off" '+(ex||'')+'>'}
var NUM='maxlength="10" inputmode="numeric"',PIN='maxlength="4" inputmode="numeric"';
/* ---------- VOZ ---------- */
var PH=['pagar la energía','pagar el acueducto','pagar el gas','pagar internet o televisión','recargar tu celular','comprar un paquete de datos','hacer una consignación','pagar tu tarjeta o crédito','pagar la cuota de la cooperativa','pagar el SOAT','pagar el impuesto','sacar una copia de registro civil','gestionar la autorización de la EPS','enviar un giro'];
var RX=[/\b(luz|energia|epm|electric\w*)\b/,/\b(agua|acueducto)\b/,/\bgas\b/,/\b(internet|wifi|television|tv)\b/,/\b(recarg\w*|minutos|saldo|celular)\b/,/\b(datos|paquete|gigas?)\b/,/\b(consign\w*|deposit\w*|banco|bancolombia|bancaria|transaccion)\b/,/\b(tarjeta|credito)\b/,/\bcooperativa\b/,/\bsoat\b/,/\b(predial|impuesto\w*)\b/,/(registro civil|copia)/,/\b(eps|medicamentos?|autorizacion|salud)\b/,/\b(giro|girar|enviar (plata|dinero)|mandar (plata|dinero))\b/];
var SMP=[87400,42300,36500,79900,20000,15000,100000,150000,60000,285000,120000,10000,0,100000];
var PRI=[5,4,9,10,11,12,13,6,7,8,3,2,1,0];
CAT.push(['Monedero','👛']);SV.push([5,'Recarga de monedero','👛',0,null,'Valor a cargar']);
PH.push('recargar tu monedero');RX.push(/\b(monedero|billetera)\b/);SMP.push(50000);PRI.unshift(14);
var REQ=[['Recibo de energía vigente','N.º de contrato'],['Recibo de acueducto vigente','Matrícula'],['Factura de gas','N.º de cuenta'],['Factura de internet o TV','N.º de cuenta'],['N.º de celular','Operador (Claro, Movistar, Tigo…)'],['N.º de celular','Paquete que quieres'],['Banco y N.º de cuenta','Nombre del titular','Cédula de quien consigna'],['Recibo o extracto de la tarjeta','N.º de obligación'],['Recibo de la cuota','N.º de asociado'],['Placa del vehículo','Cédula del propietario','Tarjeta de propiedad'],['Recibo del impuesto o matrícula','Cédula del propietario'],['Nombre y fecha de nacimiento','Cédula del solicitante'],['Cédula','Orden médica o autorización'],['Nombre y cédula de quien recibe','Celular de quien recibe'],['Efectivo del valor a cargar']];
var SELF=[0,1,2,3,4,5,6,7,8,9,10,13];
var UN={cero:0,un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,veinte:20,veintiuno:21,veintidos:22,veintitres:23,veinticuatro:24,veinticinco:25,veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29,treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90,cien:100,ciento:100,doscientos:200,trescientos:300,cuatrocientos:400,quinientos:500,seiscientos:600,setecientos:700,ochocientos:800,novecientos:900};
var PROV={0:['EPM','CHEC'],1:['Aguas de Marinilla'],2:['EPM'],3:['Claro','Tigo','Movistar'],4:['Claro','Tigo','Movistar'],5:['Claro','Tigo','Movistar']};
var PACKS={Claro:[['Paquete 2 GB · 7 días',12000],['Paquete 5 GB · 15 días',22000],['Paquete 10 GB · 30 días',35000]],Tigo:[['Paquete 3 GB · 7 días',12000],['Paquete 6 GB · 15 días',22000],['Paquete 12 GB · 30 días',35000]],Movistar:[['Paquete 2 GB · 7 días',10000],['Paquete 6 GB · 15 días',20000],['Paquete 15 GB · 30 días',40000]]};
var YES=/\b(si|sii|claro|dale|confirmo|confirmar|correcto|listo|ok|okay|perfecto|exacto|de una|esta bien)\b/,NO=/\b(no|nel|corregir|cambiar|otra|incorrecto)\b/;
var SR=window.SpeechRecognition||window.webkitSpeechRecognition,rec=null,voices=[],VT=[];
function norm(t){return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9.\s]/g,' ').replace(/\s+/g,' ').trim()}
function sp(x){return x.toLocaleString('es-CO')+' pesos'}
function newV(){return {step:'idle',svc:null,spoken:null,photo:null,ocr:null,inputMode:'',fields:{},last:'',log:[{w:'a',t:'Toca el botón de la cámara y mándame una foto de tu recibo: yo lo leo y se lo envío a Carlos. También puedes decirme qué trámite necesitas.'}]}}
function vFields(i){
if(i>=0&&i<=3)return [['reference',SV[i][5],'text','Escribe la referencia'],['amount','Valor a pagar','number','Ej: 85000']];
if(i===4)return [['phone','Número de celular','tel','3XX XXX XXXX'],['amount','Valor de la recarga','number','Ej: 20000']];
if(i===5)return [['phone','Número de celular','tel','3XX XXX XXXX'],['package','Paquete seleccionado','text','Paquete elegido'],['amount','Valor del paquete','number','Ej: 15000']];
if(i===6)return [['bank','Banco','text','Ej: Bancolombia'],['accountType','Tipo de cuenta','text','Ahorros o corriente'],['account','Número de cuenta','tel','Número de cuenta'],['holder','Nombre del titular','text','Nombre completo'],['amount','Valor a consignar','number','Ej: 100000'],['concept','Concepto','text','Motivo de la consignación']];
if(i===7)return [['entity','Entidad o banco','text','Ej: Bancolombia'],['obligation','Número de obligación','text','Número de tarjeta o crédito'],['amount','Valor a pagar','number','Ej: 150000']];
if(i===8)return [['associate','Número de asociado','text','Número de asociado'],['amount','Valor de la cuota','number','Ej: 60000']];
if(i===9)return [['plate','Placa del vehículo','text','Ej: ABC123'],['ownerDocument','Documento del propietario','tel','Sin puntos'],['amount','Valor del SOAT','number','Ej: 285000']];
if(i===10)return [['plate','Matrícula o placa','text','Matrícula o placa'],['ownerDocument','Documento del propietario','tel','Sin puntos'],['amount','Valor del impuesto','number','Ej: 120000']];
if(i===11)return [['personName','Nombre de la persona','text','Nombre completo'],['birthDate','Fecha de nacimiento','date',''],['document','Documento del solicitante','tel','Sin puntos']];
if(i===12)return [['document','Documento del paciente','tel','Sin puntos'],['authorization','Número de autorización u orden','text','Número de autorización']];
if(i===13)return [['recipient','Nombre de quien recibe','text','Nombre completo'],['document','Documento de quien recibe','tel','Sin puntos'],['phone','Celular de quien recibe','tel','3XX XXX XXXX'],['city','Municipio','text','Municipio de destino'],['amount','Valor del giro','number','Ej: 100000'],['concept','Concepto','text','Mensaje opcional']];
if(i===14)return [['amount','Valor a cargar','number','Ej: 50000']];
return [];
}
function vinp(id,label,type,ph){return '<label for="vf_'+id+'">'+label+'</label><input id="vf_'+id+'" data-vf="'+id+'" type="'+type+'" placeholder="'+ph+'" value="'+esc(S.v.fields[id]||'')+'" autocomplete="off">'}
function speak(t,force){if((!S.voice&&!force)||!window.speechSynthesis)return;try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.lang='es-CO';var v=voices.filter(function(x){return /^es[-_](CO|MX|US|419)/i.test(x.lang)})[0]||voices.filter(function(x){return /^es/i.test(x.lang)})[0];if(v){u.voice=v;u.lang=v.lang}u.rate=.95;u.onerror=function(e){if(e.error&&e.error!=='interrupted'&&e.error!=='canceled')toast('No se pudo reproducir el audio ('+e.error+')')};speechSynthesis.speak(u);if(speechSynthesis.paused)speechSynthesis.resume()}catch(e){}}
if(window.speechSynthesis){var lv=function(){voices=speechSynthesis.getVoices()};lv();speechSynthesis.onvoiceschanged=lv}
function vlog(w,t){S.v.log.push({w:w,t:t});S.vb=true}
function vsay(t){vlog('a',t);S.v.last=t;speak(t)}
function detect(t){if(/\b(chec|energia electrica|electricidad|consumo de energia|factura de energia|alumbrado publico)\b/.test(t)&&!/\b(predial|impuesto predial)\b/.test(t))return 0;if(/\b(aguas? de marinilla|acueducto|agua potable)\b/.test(t))return 1;for(var k=0;k<PRI.length;k++)if(RX[PRI[k]].test(t))return PRI[k];return -1}
function parseNum(t){var m=t.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\s*(mil|millones|millon))?/);
if(m){var n=parseInt(m[1].replace(/[.\s]/g,''),10);if(m[2]==='mil')n*=1000;else if(m[2])n*=1e6;return n>=1000?n:null}
var best=0,run=[];function flush(){if(run.length){var tot=0,cur=0;run.forEach(function(w){if(w==='mil'){tot+=(cur||1)*1000;cur=0}else if(/^millon/.test(w)){tot+=(cur||1)*1e6;cur=0}else if(UN[w]!==undefined)cur+=UN[w]});best=Math.max(best,tot+cur);run=[]}}
t.split(' ').forEach(function(w){if(UN[w]!==undefined||w==='mil'||/^millon/.test(w)||(w==='y'&&run.length))run.push(w);else flush()});flush();return best>=1000?best:null}
var SAM=null;if(window.claude&&window.claude.use){try{window.claude.use('sample').then(function(f){SAM=f}).catch(function(){})}catch(e){}}
var HOME='<label class="btn" for="cam" style="padding:20px;font-size:18px">📷 Enviar foto del recibo</label><input id="cam" class="vh" type="file" accept="image/*" capture="environment"><label class="btn sec" for="gal">🖼️ Elegir de la galería</label><input id="gal" class="vh" type="file" accept="image/*"><p class="mut" style="text-align:center;margin-top:6px">Yo leo el recibo y se lo envío a Carlos.</p>';
function shrink(file,cb){var im=new Image(),u=URL.createObjectURL(file);im.onload=function(){var M=1280,k=Math.min(1,M/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);c.toBlob(function(b){cb(b||file)},'image/jpeg',.82)};im.onerror=function(){cb(file)};im.src=u}
function ocrMoney(value){var digits=String(value||'').replace(/[^0-9.,\s]/g,'').trim();if(!digits)return 0;digits=digits.replace(/[.,\s]/g,'');var amount=parseInt(digits,10)||0;return amount>=1000?amount:0}
function parseOcrText(text){var raw=String(text||''),clean=norm(raw),i=detect(clean),lines=raw.split(/\r?\n/),ref='',amount=0,date='',empresa=/\bchec\b/i.test(raw)?'CHEC':i>=0?(PROV[i]&&PROV[i][0]?PROV[i][0]:SV[i][1]):'';
var refMatch=raw.match(/(?:contrato|cuenta|matr[ií]cula|referencia|obligaci[oó]n|placa|celular|tel[eé]fono)[^\dA-Z]*(\d[\d\s.-]{4,})/i)||raw.match(/\b\d{7,12}\b/);if(refMatch)ref=String(refMatch[1]||refMatch[0]).replace(/[^0-9A-Za-z]/g,'');
lines.some(function(line){if(!/(total|valor|pagar|pago|saldo|importe)/i.test(line))return false;var match=line.match(/(?:\$\s*)?([0-9][0-9.,\s]{2,})/);if(match){amount=ocrMoney(match[1]);return amount>0}return false});
if(!amount){var money=raw.match(/\$\s*([0-9][0-9.,\s]{2,})/);if(money)amount=ocrMoney(money[1])}
var dateMatch=raw.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b/);if(dateMatch)date=dateMatch[1];
var confidence=(i>=0?.35:0)+(ref?.25:0)+(amount>=1000?.3:0)+(date?.1:0);
return {leible:!!(i>=0||ref||amount),servicio:i,empresa:empresa,referencia:ref,valor:amount,vencimiento:date,vencido:false,confianza:confidence,nota:confidence<.75?'Revisa los datos extraídos del recibo.':'Datos extraídos localmente.'}}
function readReceipt(blob){return new Promise(function(res,rej){if(SAM){
var names=SV.slice(0,14).map(function(x,i){return i+' = '+x[1]}).join('; '),hoy=new Date().toISOString().slice(0,10);
var q='Eres el lector de recibos de ChochoPagos (Colombia). La imagen es la foto de un recibo o factura que un cliente quiere pagar. Responde SOLO un JSON con estas claves: "leible" (boolean), "servicio" (número según esta lista: '+names+'; usa -1 si no corresponde a ninguno), "empresa" (string), "referencia" (string: contrato, cuenta, matrícula, placa o celular), "valor" (número entero en pesos colombianos del total a pagar, sin puntos ni signos), "vencimiento" (AAAA-MM-DD o ""), "vencido" (boolean; hoy es '+hoy+'), "confianza" (número entre 0 y 1) y "nota" (string de máximo 12 palabras). Si la imagen no es un recibo, pon leible en false.';
SAM.json(q,{images:[blob],modelTier:'default'}).then(function(data){data.source='ai';res(data)},rej);return}
if(!window.Tesseract)return rej({code:'no_sample'});
window.Tesseract.recognize(blob,'spa',{logger:function(info){if(info&&info.status==='recognizing text'&&S.v)S.vmsg='Leyendo texto del recibo '+Math.round((info.progress||0)*100)+'%...'}}).then(function(result){var data=parseOcrText(result&&result.data&&result.data.text);if(!data.leible)return rej({code:'ilegible'});res(data)}).catch(rej)})}
function aiFail(V,e){var no=e&&(e.code==='no_sample'||e.code==='not_granted'||e.code==='images_unavailable');
V.step=V.svc===14?'idle':'choose';V.inputMode='';V.ocr=null;V.ai=null;
vsay(no?'No puedo leer automáticamente esta foto ahora. Puedes escribir los datos o dictarlos por voz para continuar con '+SV[V.svc][1]+'.':'No pude leer bien el recibo. Puedes escribir los datos, dictarlos por voz o tomar otra foto con más luz.');render()}
function aiDone(V,d){var i=parseInt(d&&d.servicio,10),m=Math.round(Number(d&&d.valor))||0,conf=Number(d&&d.confianza)||0,company=norm(String(d&&d.empresa||''));
if(/\b(chec|energia electrica|electricidad|factura de energia)\b/.test(company))i=0;else if(/\b(aguas? de marinilla|acueducto)\b/.test(company))i=1;
if(!d||!d.leible||!(i>=0&&i<=13)||conf<.5){aiFail(V,{code:'ilegible'});return}
		var sv=SV[i];V.svc=i;V.inputMode='photo';V.formComplete=false;V.provider=V.provider||String(d.empresa||'');V.ai={source:d.source||'ai',empresa:String(d.empresa||sv[1]),ref:String(d.referencia||''),venc:String(d.vencimiento||''),vencido:!!d.vencido,conf:conf,nota:String(d.nota||'')};
if(sv[4]!==null)m=sv[4];
if(sv[4]===null&&m<1000){V.step='wamt';vsay('Reconocí un recibo de '+V.ai.empresa+' ('+sv[1]+'), pero no pude leer bien el valor. ¿De cuánto es? Dímelo, por ejemplo: ochenta y cinco mil.');render();return}
V.ocr={ref:V.ai.ref,m:m,tot:m+sv[3]+DOM};V.step='confirm';V.hold=false;V.auto=!V.ai.vencido&&conf>=.75;
vsay('Leí un recibo de '+V.ai.empresa+' ('+sv[1]+') por '+sp(m)+(V.ai.ref?', referencia terminada en '+V.ai.ref.slice(-4):'')+'. Con comisión y domicilio, el efectivo a entregar es '+sp(V.ocr.tot)+'. '+(V.auto?'Se lo envío a Carlos en unos segundos. Di cancelar para detenerlo.':V.ai.vencido?'Ojo: el recibo parece vencido. ¿Lo envío de todos modos?':'No estoy del todo seguro de los datos. ¿Los confirmas?'));
if(V.auto)VT.push(setTimeout(function(){if(S.v===V&&V.step==='confirm'&&!V.hold){vplace();render()}},9000));
render()}
function notifyOp(){if(!S.op||(S.tab!=='d'&&S.tab!=='a'))return;S.orders.forEach(function(o){if(S.opSeen[o.id])return;S.opSeen[o.id]=1;if(o.s===0&&!o.self){if(S.tab==='d')speak('Nuevo pedido de '+o.u+': '+nm(o)+', '+sp(tot(o))+'.');toast('🏍️ Nuevo pedido #'+o.id+' de '+o.u)}})}
function vSetSvc(i,amt){var V=S.v;V.svc=i;V.provider='';V.spoken=SV[i][4]===null?amt:null;V.inputMode='';V.fields={};V.step=(i>=0&&i<=5)?'provider':'choose';
if(V.step==='provider')vsay(i===4?'Selecciona tu operador móvil para hacer la recarga.':i===5?'Selecciona tu operador móvil para ver los paquetes disponibles.':'Entendí: quieres pagar '+SV[i][1]+'. Primero selecciona la empresa disponible.');
else vsay('Entendí: quieres '+PH[i]+'. Puedes adjuntar una foto, escribir los datos o continuar conversando por voz.');}
function vChooseProvider(provider){var V=S.v;V.provider=provider;
if(V.svc===4){V.fields.phone=S.me?S.me.cel:'';V.step='recharge';vsay('Seleccionaste '+provider+'. ¿Cuánto valor quieres recargar en tu celular?');}
else if(V.svc===5){V.step='package';vsay('Seleccionaste '+provider+'. Escoge uno de los paquetes disponibles.');}
else{V.step='choose';vsay('Seleccionaste '+provider+'. Ahora elige si quieres adjuntar una foto, escribir los datos o dictarlos.');}render()}
function vChoosePackage(label,amount){var V=S.v;V.fields.package=label;V.fields.amount=String(amount);V.inputMode='form';V.formComplete=true;V.ocr={ref:V.fields.phone||'',m:amount,tot:amount+SV[V.svc][3]+DOM};V.step='confirm';vsay('Seleccionaste '+label+' de '+sp(amount)+' para '+V.provider+'. Revisa el total y confirma.');render()}
function vRechargeSubmit(){var V=S.v,amount=parseInt(V.fields.amount,10)||0;if(amount<1000){toast('Escribe un valor válido, mínimo $1.000');return}V.inputMode='form';V.formComplete=true;V.ocr={ref:V.fields.phone||'',m:amount,tot:amount+SV[V.svc][3]+DOM};V.step='confirm';vsay('Recarga de '+sp(amount)+' para '+V.provider+'. Revisa el total y confirma.');render()}
function vChooseMode(mode){var V=S.v;V.inputMode=mode;
if(mode==='photo'){V.step='photo';vsay('Adjunta una foto clara del recibo. El domiciliario también podrá completar los datos faltantes.');return}
if(mode==='form'){V.step='form';vsay('Completa los datos solicitados. Los revisaremos antes de enviar el pedido.');return}
V.voiceFields=vFields(V.svc).filter(function(x){return !(x[0]==='amount'&&SV[V.svc][4]!==null)});V.voiceIndex=0;if(SV[V.svc][4]!==null)V.fields.amount=String(SV[V.svc][4]);V.step='voiceform';vsay('Continúa por voz. Dime '+V.voiceFields[0][1]+'.');}
function vFormSubmit(){var V=S.v,fields=vFields(V.svc),missing=[];
if(V.svc>=0&&V.svc<=3&&!V.provider){toast('Selecciona la empresa de la factura');return}
fields.forEach(function(x){if(x[0]!=='concept'&&!String(V.fields[x[0]]||'').trim())missing.push(x[1])});
if(missing.length){toast('Falta: '+missing[0]);return}
var amount=SV[V.svc][4]!==null?SV[V.svc][4]:parseInt(V.fields.amount,10)||0;
if(amount<1000&&V.svc!==12){toast('Escribe un valor válido, mínimo $1.000');return}
var ref=V.fields.reference||V.fields.account||V.fields.phone||V.fields.document||'';
V.ocr={ref:ref,m:amount,tot:amount+SV[V.svc][3]+DOM};V.formComplete=true;V.step='confirm';V.auto=false;
vsay('Datos recibidos. El total '+(V.svc===14?'a entregar':'del pedido')+' es '+sp(V.ocr.tot)+'. Revisa el resumen y confirma.');render()}
function vFormRows(V){var h=V.provider?'<div class="row"><span>Empresa</span><span>'+esc(V.provider)+'</span></div>':'';return h+Object.keys(V.fields||{}).filter(function(k){return V.fields[k]}).map(function(k){return '<div class="row"><span>'+k+'</span><span>'+esc(V.fields[k])+'</span></div>'}).join('')}
function vHelp(){var V=S.v,msg;
if(V.step==='provider')msg='Puedes decir el nombre de una empresa disponible: '+(PROV[V.svc]||[]).join(', ')+'.';
else if(V.step==='choose')msg='Puedes decir foto para adjuntar un recibo, escribir para llenar un formulario o voz para dictar los datos.';
else if(V.step==='voiceform'){var field=V.voiceFields[V.voiceIndex];msg='Ahora necesito: '+field[1]+'. También puedes decir repetir, volver o cancelar.';}
else if(V.step==='confirm')msg='Puedes decir confirmar, corregir o cancelar. También puedo repetir el resumen.';
else if(V.step==='recharge')msg='Di el valor de la recarga, por ejemplo veinte mil, o di cancelar.';
else msg='Puedes decir pagar la luz, pagar el agua, recargar tu celular, pagar el SOAT, consultar el estado, ver opciones o pedir ayuda.';
vsay(msg);render()}
function vInfo(t){var msg;
if(/(que servicios|que tramites|que ofrecen|servicios tienen|tramites tienen)/.test(t)){msg='Puedes solicitar pagos de energía, acueducto, gas, internet, recargas, paquetes de datos, pagos y bancos, SOAT, impuestos, trámites de documentos y giros.'}
else if(/(cuanto cuesta|cuanto vale|precio|tarifa|comision|domicilio)/.test(t)){msg='El domicilio cuesta '+sp(DOM)+'. Cada trámite muestra su comisión antes de confirmar. El total siempre aparece antes de enviar el pedido.'}
else if(/(como pago|formas de pago|medio de pago|efectivo|saldo|monedero)/.test(t)){msg='Puedes entregar efectivo al domiciliario o pagar con tu saldo en los servicios que permiten hacerlo desde casa.'}
else if(/(que necesito|requisitos|documentos)/.test(t)){if(S.v.svc!==null&&REQ[S.v.svc])msg='Para este trámite necesitas: '+REQ[S.v.svc].join(', ')+'. También tendrás que confirmar el valor.';else msg='Puedes enviar una foto del recibo, escribir los datos o dictarlos por voz.'}
else if(/(sin internet|sin señal|offline|no tengo internet)/.test(t)){msg='Puedes registrar el pedido y recoger el efectivo sin señal. Cuando vuelva la conexión, la operación queda pendiente de sincronización.'}
else if(/(horario|cuando atienden|hora de atencion)/.test(t)){msg='En esta demo el Centro está disponible durante el día. En una versión real el horario lo define el comercio aliado.'}
else if(/(contacto|whatsapp|soporte|hablar con alguien|centro comunitario)/.test(t)){msg='Puedes solicitar ayuda al Centro Comunitario o escribir por WhatsApp. En esta demo el soporte se representa dentro de la aplicación.'}
else if(/(como funciona|que puedo hacer|para que sirve)/.test(t)){msg='ChochoPagos te permite pedir un pago o trámite, enviar el recibo, entregar efectivo al domiciliario y seguir el estado hasta recibir el comprobante.'}
else return false;
vsay(msg);render();return true}
function vBack(){var V=S.v;if(V.step==='idle'){vsay('Ya estás en el inicio. Di ver opciones para conocer los servicios disponibles.');return}V.step=V.svc===null?'idle':(V.svc>=0&&V.svc<=5?'provider':'choose');V.hold=true;vsay('Volviste al paso anterior. Di ayuda si necesitas opciones.');render()}
function hv(raw,sim){var V=S.v,t=norm(raw);if(!t)return;vlog('u',raw+(sim?' (ejemplo)':''));
if(/\b(repetir|repite)\b/.test(t)&&V.last){vsay(V.last);return}
if(/(empezar de nuevo|cancelar|reiniciar)/.test(t)){S.v=newV();return}
if(vInfo(t))return;
if(/(ayuda|opciones|que puedo hacer|como funciona|no entiendo|menu|servicios disponibles)/.test(t)){vHelp();return}
if(/(volver|atras|regresar|paso anterior)/.test(t)){vBack();return}
if(V.step==='idle'&&/(historial|facturas anteriores|comprobantes anteriores)/.test(t)){S.ut='h';vsay('Aquí puedes consultar tus comprobantes y facturas anteriores.');render();return}
if(V.step==='idle'&&/(mis pedidos|ver pedidos|pedidos activos)/.test(t)){S.ut='o';vsay('Aquí puedes consultar tus pedidos activos y su estado.');render();return}
if(V.step==='idle'&&/(mi saldo|ver saldo|cuanto tengo)/.test(t)){S.ut='m';vsay('Aquí puedes consultar tu saldo y tus movimientos.');render();return}
if(V.step==='idle'&&/(mi perfil|mis datos|configuracion)/.test(t)){S.ut='r';vsay('Aquí puedes consultar tus datos y configuración.');render();return}
if(/(como va|donde esta|estado|cuando llega)/.test(t)){var mine=S.orders.filter(function(o){return o.uid===S.me.cel}),o=mine[mine.length-1];vsay(o?'Tu pedido número '+o.id+' está: '+LB[o.s]+'. '+MSG[o.s]:'Todavía no tienes pedidos.');return}
if(V.step==='provider'){var pv=(PROV[V.svc]||[]).filter(function(x){return norm(x).indexOf(t)>=0||t.indexOf(norm(x))>=0})[0];if(pv){vChooseProvider(pv);return}vsay('Elige una empresa disponible: '+(PROV[V.svc]||[]).join(', ')+'.');return}
if(V.step==='choose'&&/\b(foto|imagen|recibo|adjuntar)\b/.test(t)){vChooseMode('photo');return}
if(V.step==='choose'&&/\b(escribir|texto|datos|formulario)\b/.test(t)){vChooseMode('form');return}
if(V.step==='choose'&&/\b(audio|voz|dictar|decir)\b/.test(t)){vChooseMode('voice');return}
if(V.step==='recharge'){var rechargeAmount=parseNum(t);if(rechargeAmount){V.fields.amount=String(rechargeAmount);vRechargeSubmit()}else vsay('No entendí el valor. Di, por ejemplo, veinte mil.');return}
if(V.step==='voiceform'){var vf=V.voiceFields[V.voiceIndex],value=vf[0]==='amount'?(parseNum(t)||parseInt(t,10)||0):t;if(!value){vsay('No entendí ese dato. Dímelo nuevamente, por favor.');return}V.fields[vf[0]]=String(value);V.voiceIndex++;if(V.voiceIndex<V.voiceFields.length){vsay('Ahora dime '+V.voiceFields[V.voiceIndex][1]+'.')}else vFormSubmit();return}
var svc=detect(t);
if(svc<0&&/\bfactura\b/.test(t)){V.step='idle';vsay('¿Qué tipo de factura quieres pagar: energía, agua, gas o internet?');return}
if(V.step==='confirm'){if(NO.test(t)){V.step=V.svc===14?'idle':'photo';vsay(V.svc===14?'Sin problema. ¿Qué trámite necesitas?':'Sin problema. Tómale otra foto al recibo o dime qué trámite necesitas.');return}if(YES.test(t)){vplace();return}vsay('¿Confirmas el pedido? Di “sí” o “no”.');return}
if(V.step==='wamt'&&svc<0){var wa=parseNum(t);if(wa){V.ocr={ref:(V.ai&&V.ai.ref)||'',m:wa,tot:wa+SV[V.svc][3]+DOM};V.step='confirm';V.auto=false;vsay((V.svc===14?'Recargar tu saldo con ':'Valor del recibo: ')+sp(wa)+'. Con comisión y domicilio, el efectivo a entregar es '+sp(V.ocr.tot)+'. ¿Confirmas?')}else vsay('No entendí el valor. Dime, por ejemplo: cincuenta mil.');return}
if(V.step==='reading'){vsay('Un momento, estoy leyendo tu recibo.');return}
if(svc>=0){vSetSvc(svc,parseNum(t));return}
if(V.step==='photo'&&NO.test(t)){V.step='idle';V.svc=null;vsay('Está bien. ¿Qué trámite necesitas?');return}
vsay(V.step==='photo'?'Necesito la foto del recibo. Toca el botón de la cámara.':'No te entendí bien. Puedes decir: “pagar la luz”, “recargar 20 mil” o “pagar el SOAT”.')}
function vPhoto(file){var V=S.v;if(!file||(V.step!=='idle'&&V.step!=='photo'))return;V.step='reading';V.photo=URL.createObjectURL(file);V.ai=null;V.ocr=null;vlog('u','📷 Foto del recibo enviada');vsay('Recibí tu foto. Estoy leyendo el recibo…');render();
shrink(file,function(b){readReceipt(b).then(function(d){if(S.v===V)aiDone(V,d)}).catch(function(e){if(S.v===V)aiFail(V,e)})})}
function vself(){var V=S.v,sv=SV[V.svc],oc=V.ocr,need=oc.m+sv[3],cel=S.me.cel;
if(S.f.spin!==S.me.pin){toast('PIN incorrecto');return}
if(bal('mon',cel)<need){toast('Tu saldo no alcanza');return}
if(bal('plat')<oc.m){toast('Servicio no disponible ahora. Pide el domicilio.');return}
var o={id:S.id++,u:fn(S.me),uid:cel,sv:V.svc,provider:V.provider||'',ref:oc.ref||'Recibo',m:oc.m,fee:sv[3],s:4,scan:V.inputMode==='photo',photo:V.photo,ai:V.ai||null,form:V.fields||{},inputMode:V.inputMode||'voice',opData:{},opComplete:true,code:'',arr:true,chk:true,self:true,t0:Date.now(),t1:Date.now(),by:'monedero',rend:true};
S.orders.push(o);S.orderView=o.id;S.seen[o.id]=4;
if(oc.m>0)mv('u','mon','Pago de '+sv[1]+' #'+o.id,-oc.m,o.id,cel);if(sv[3]>0)mv('u','mon','Comisión del servicio #'+o.id,-sv[3],o.id,cel);
if(oc.m>0)mv('c','plat','Pago de '+sv[1]+' #'+o.id+' (autopago)',-oc.m,o.id,'');if(sv[3]>0)mv('c','com','Comisión #'+o.id+' ('+sv[1]+')',sv[3],o.id,'');
S.f.spin='';S.v=newV();S.ut='h';speak('Listo. Pagaste tu trámite desde tu saldo. El comprobante está en Historial.');toast('Pagado desde tu saldo')}
function vplace(){var V=S.v,sv=SV[V.svc];var o={id:S.id++,u:fn(S.me),uid:S.me.cel,sv:V.svc,provider:V.provider||'',ref:V.svc===14?'Recarga de saldo':(V.ocr.ref||'Recibo'),m:V.ocr.m,fee:sv[3],s:0,scan:V.inputMode==='photo',photo:V.photo,ai:V.ai||null,form:V.fields||{},inputMode:V.inputMode||'voice',opData:{},opComplete:false,code:String(1000+Math.floor(Math.random()*9000)),arr:false,chk:false,t0:Date.now(),t1:0,by:'',rend:false,sync:S.on?'synced':'pending'};
if(!S.on)queueOrder(o);S.orders.push(o);S.orderView=o.id;S.seen[o.id]=0;S.v=newV();S.ut='o';speak('Listo. Tu pedido número '+o.id+' quedó registrado. Alista '+sp(tot(o))+' en efectivo; Carlos pasará por tu casa. Tu código de entrega es '+o.code.split('').join(' ')+'.');toast('Pedido #'+o.id+' enviado');notifyOp()}
function listen(){
if(!SR){S.vmsg='Este navegador no reconoce voz (prueba Chrome o Safari). Puedes escribir abajo o usar los ejemplos.';render();return}
if(rec&&S.listening){rec.stop();return}
if(window.speechSynthesis)speechSynthesis.cancel();
try{rec=new SR();rec.lang='es-CO';rec.interimResults=true;rec.maxAlternatives=1;rec.continuous=false}catch(e){toast('No se pudo iniciar el micrófono');return}
var fin='';
rec.onstart=function(){S.vmsg='';S.listening=true;render();var l=el('live');if(l)l.textContent='Escuchando…'};
rec.onresult=function(e){var tx='';for(var i=e.resultIndex;i<e.results.length;i++){tx+=e.results[i][0].transcript;if(e.results[i].isFinal)fin=tx}var l=el('live');if(l)l.textContent='“'+tx+'”'};
rec.onerror=function(e){var m={'not-allowed':'El micrófono está bloqueado en esta vista. Abre el enlace en una pestaña nueva de Chrome o Safari y permite el micrófono, o escribe abajo.','service-not-allowed':'El navegador no deja usar el reconocimiento de voz aquí. Escribe abajo o usa los ejemplos.','no-speech':'No te escuché. Toca el micrófono e inténtalo de nuevo.','audio-capture':'No se encontró un micrófono.','network':'Se necesita internet para reconocer la voz.'};if(e.error!=='aborted'){S.vmsg=m[e.error]||('Error de voz: '+e.error);render()}};
rec.onend=function(){S.listening=false;if(fin)hv(fin);render()};
try{rec.start()}catch(e){}}
function notify(){if(!S.me||(S.tab!=='u'&&S.tab!=='a'))return;S.orders.forEach(function(o){if(o.uid!==S.me.cel)return;var p=S.seen[o.id];if(p===undefined){S.seen[o.id]=o.s;return}if(o.s>p){S.seen[o.id]=o.s;speak(MSG[o.s]);toast('Tu pedido #'+o.id+': '+LB[o.s])}})}
/* ---------- ROSTRO Y RECARGAS ---------- */
var FC=null,TH=.6;
function loginUser(u){S.me=u;S.ut='p';S.f.pin='';S.v=newV();S.orders.forEach(function(o){if(o.uid===u.cel)S.seen[o.id]=o.s});toast('¡Bienvenido/a, '+fn(u)+'!')}
function faceVec(url,cb){var im=new Image();im.onload=function(){var N=16,c=document.createElement('canvas');c.width=c.height=N;var x=c.getContext('2d');var m=Math.min(im.width,im.height);x.drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,N,N);var d=x.getImageData(0,0,N,N).data,v=[],sum=0;for(var i=0;i<d.length;i+=4){var g=.299*d[i]+.587*d[i+1]+.114*d[i+2];v.push(g);sum+=g}var mean=sum/v.length,sd=Math.sqrt(v.reduce(function(a,g){return a+(g-mean)*(g-mean)},0)/v.length)||1;cb(v.map(function(g){return (g-mean)/sd}))};im.onerror=function(){toast('No se pudo leer la foto')};im.src=url}
function faceSim(a,b){var t=0;for(var i=0;i<a.length;i++)t+=a[i]*b[i];return t/a.length}
function applyFace(v,url){var c=FC;if(!c)return;
if(c.mode==='enroll'){S.faces[c.key]=v;S.facePic[c.key]=url;toast('Rostro registrado ✅ Ya puedes entrar con tu cara');return}
var sim=faceSim(v,S.faces[c.key]);
if(sim>=TH){toast('Rostro reconocido ('+Math.round(sim*100)+'%)');if(c.r==='u')loginUser(S.users.filter(function(x){return x.cel===c.key})[0]);else if(c.r==='d')S.op=true;else S.ce=true}
else toast('No te reconocimos ('+Math.round(sim*100)+'% de similitud). Intenta de nuevo o usa tu PIN.')}
function processFace(file){if(!file||!FC)return;var url=URL.createObjectURL(file);faceVec(url,function(v){applyFace(v,url);render()});var fi=el('faceIn');if(fi)fi.value=''}
function faceCard(r,key){var has=S.faces[key];return '<div class="card"><h3>😀 Ingreso con rostro</h3>'+(has?'<img class="rimg" style="max-height:110px;width:auto" alt="Rostro registrado" src="'+S.facePic[key]+'"><p class="mut">Activado ✅</p>':'<p class="mut">Aún no lo activas.</p>')+'<label class="btn sec" for="faceIn" data-a="fctx" data-i="enroll" data-r="'+r+'">📸 '+(has?'Volver a registrar mi rostro':'Activar con mi rostro')+'</label><p class="mut" style="margin-top:6px">Demo: compara tu selfie con una imagen simple. Un sistema real usaría reconocimiento biométrico seguro y prueba de vida.</p></div>'}
function rechCard(r){var p=r==='d'?['rcel','ramt','rok']:['ccel','camt','cok'];
return '<div class="card"><h3>➕ Recargar la cuenta de un usuario</h3>'+inp(p[0],'Celular del usuario','tel','3XX XXX XXXX',NUM)+'<div class="gap"></div>'+inp(p[1],'Efectivo recibido (COP)','number','Ej: 50000','inputmode="numeric"')+'<label class="chk" style="display:flex;gap:8px;margin-top:8px"><input type="checkbox" data-f="'+p[2]+'"'+(S.f[p[2]]?' checked':'')+'><span>Verifiqué su identidad con la cédula</span></label><button class="btn" data-a="rch" data-r="'+r+'">Recargar cuenta</button><p class="mut" style="margin-top:6px">Solo el domiciliario o el Centro pueden recargar saldos. '+(r==='d'?'El efectivo se suma a tu efectivo en mano.':'El efectivo entra a la caja del Centro.')+'</p></div>'}
function opFieldValue(o,key,id){return String(S.inp['opf'+key+id]||((o.form||{})[key])||(key==='reference'?o.ref:key==='amount'?o.m:''))}
/* ---------- USUARIO ---------- */
function uAuth(){
var h='<div class="phone">'+splash('Pagos y trámites sin salir de la vereda')+'<div class="body">';
if(S.mode==='login')h+='<div class="card"><h3>Ingresa a tu cuenta</h3>'+inp('cel','Celular','tel','3XX XXX XXXX',NUM)+'<div class="gap"></div>'+inp('pin','PIN de 4 dígitos','password','••••',PIN)+'<button class="btn" data-a="login">Ingresar</button><label class="btn sec" for="faceIn" data-a="fctx" data-i="login" data-r="u">😀 Entrar con mi rostro</label><button class="btn sec" data-a="mode" data-i="reg">¿Primera vez? Regístrate</button></div><p class="mut" style="text-align:center">Cuenta de prueba: 3128889900 · PIN 1234</p>';
else h+='<div class="card"><h3>Crea tu cuenta</h3>'+inp('name','Nombre completo','text','Ej: María Pérez')+'<div class="gap"></div>'+inp('ced','Cédula','tel','Sin puntos',NUM)+'<div class="gap"></div>'+inp('cel','Celular (WhatsApp)','tel','3XX XXX XXXX',NUM)+'<div class="gap"></div><label for="f_sector">Vereda o sector</label><select id="f_sector" data-f="sector">'+SECT.map(function(x){return '<option'+(S.f.sector===x?' selected':'')+'>'+x+'</option>'}).join('')+'</select><div class="gap"></div>'+inp('dir','Indicaciones de tu casa','text','Ej: Finca La Rosa, portón verde')+'<div class="gap"></div>'+inp('pin','Crea un PIN de 4 dígitos','password','••••',PIN)+'<div class="gap"></div>'+inp('pin2','Confirma tu PIN','password','••••',PIN)+'<label class="chk"><input type="checkbox" data-f="ok"'+(S.f.ok?' checked':'')+'><span>Autorizo el tratamiento de mis datos para recibir el servicio.</span></label><button class="btn" data-a="reg">Crear cuenta</button><button class="btn sec" data-a="mode" data-i="login">Ya tengo cuenta</button></div>';
return h+'</div></div>'}
function vU(){
if(!S.me)return uAuth();
var me=S.me,id=me.cel;
var h='<div class="phone"><div class="bar"><div>Hola, '+esc(fn(me))+' 👋<br><small>'+esc(me.sector)+'</small></div><span>💬</span></div><div class="body">';
if(S.ut==='p'){var V=S.v;
h=h.replace('<div class="body">','<div class="body" data-vb="1">');
h+='<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><span class="mut">👛 Mi saldo</span><span class="big" style="font-size:22px">'+f(bal('mon',id))+'</span></div><span class="mut" style="text-align:right;font-size:11px">Pagas sin domicilio los trámites con 🏠<br>Recarga: domiciliario o Centro</span></div>';
h+=V.log.map(function(l){return '<div class="bub'+(l.w==='u'?' me':'')+'">'+esc(l.t)+'</div>'}).join('');
if(V.step==='provider')h+='<div class="card"><h3>'+(V.svc===4||V.svc===5?'Operador móvil':'Empresa de la factura')+'</h3><p class="mut">Selecciona una opción disponible en este prototipo. En producción solo aparecerán empresas con convenio vigente.</p><div class="lst">'+(PROV[V.svc]||[]).map(function(p){return '<button class="svc" data-a="provider" data-i="'+esc(p)+'"><span>🏢 '+esc(p)+'<small>Proveedor disponible</small></span><span>Seleccionar</span></button>'}).join('')+'</div></div>';
if(V.step==='recharge')h+='<div class="card"><h3>📱 Recarga con '+esc(V.provider)+'</h3><p class="mut">Se recargará el celular registrado en tu cuenta: '+esc(V.fields.phone||'')+'</p>'+vinp('amount','Valor a recargar','number','Ej: 20000')+'<button class="btn" data-a="vrec">Revisar recarga</button><button class="btn sec" data-a="vreset">Cancelar</button></div>';
if(V.step==='package')h+='<div class="card"><h3>📶 Paquetes de '+esc(V.provider)+'</h3><p class="mut">Selecciona un paquete disponible para el celular '+esc(S.me?S.me.cel:'')+'.</p><div class="lst">'+(PACKS[V.provider]||[]).map(function(p){return '<button class="svc" data-a="package" data-i="'+esc(p[0])+'" data-t="'+p[1]+'"><span>📦 '+esc(p[0])+'</span><b>'+f(p[1])+'</b></button>'}).join('')+'</div><button class="btn sec" data-a="vreset">Cancelar</button></div>';
if(V.step==='choose')h+='<div class="card"><h3>¿Cómo quieres entregar la información?</h3><p class="mut">Puedes usar la opción que te resulte más cómoda.</p><button class="btn" data-a="vchoose" data-i="photo">📷 Adjuntar foto del recibo</button><button class="btn sec" data-a="vchoose" data-i="form">✍️ Escribir los datos</button><button class="btn sec" data-a="vchoose" data-i="voice">🎤 Dictar los datos</button></div>';
if(V.step==='form'){h+='<div class="card"><h3>'+SV[V.svc][2]+' '+SV[V.svc][1]+'</h3><p class="mut">Completa la información necesaria para que el domiciliario pueda realizar la operación.</p>';vFields(V.svc).forEach(function(x){h+=vinp(x[0],x[1],x[2],x[3])});h+='<button class="btn" data-a="vform">Revisar información</button><button class="btn sec" data-a="vreset">Cancelar</button></div>'}
if(V.step==='photo'){var s0=SV[V.svc];h+='<div class="card"><h3>'+s0[2]+' '+s0[1]+'</h3>'+(SELF.indexOf(V.svc)>=0?'<span class="pill p2">🏠 Puedes pagarlo tú desde casa</span>':'')+'<p class="mut" style="margin-top:6px">Ten a la mano:</p><ul style="margin:4px 0 8px 18px;font-size:13px">'+REQ[V.svc].map(function(x){return '<li>'+x+'</li>'}).join('')+'<li>Efectivo del total a entregar</li></ul><label class="btn" for="cam">📷 Tomar foto del recibo</label><input id="cam" class="vh" type="file" accept="image/*" capture="environment"><label class="btn sec" for="gal">🖼️ Elegir de la galería</label><input id="gal" class="vh" type="file" accept="image/*"><button class="btn sec" data-a="vreset">No era eso</button></div>'}
if(V.step==='reading')h+='<div class="card"><div class="pv sc"><img alt="Recibo" src="'+V.photo+'"></div><b>Leyendo tu recibo…</b></div>';
if(V.step==='confirm'){var s1=SV[V.svc],oc=V.ocr,ai=V.ai;
h+='<div class="card">'+(V.photo?'<div class="pv"><img alt="Recibo" src="'+V.photo+'"></div>':'')+'<h3>'+(V.svc===14?'Recarga de saldo':'Esto leí del recibo')+(ai?' <span class="pill p2">🤖 Claude</span>':'')+'</h3><div class="row"><span>Trámite</span><span>'+s1[1]+'</span></div>'+(V.inputMode==='form'?vFormRows(V):'')+(ai&&ai.empresa?'<div class="row"><span>Empresa</span><span>'+esc(ai.empresa)+'</span></div>':'')+(oc.ref?'<div class="row"><span>Referencia</span><span>'+esc(oc.ref)+'</span></div>':'')+(ai&&ai.venc?'<div class="row"><span>Vencimiento</span><span>'+esc(ai.venc)+(ai.vencido?' ⚠️ vencido':'')+'</span></div>':'')+'<div class="row"><span>Valor</span><span>'+f(oc.m)+'</span></div>'+(s1[3]?'<div class="row"><span>Comisión</span><span>'+f(s1[3])+'</span></div>':'')+'<div class="row"><span>Domicilio</span><span>'+f(DOM)+'</span></div><div class="row t"><span>Efectivo a entregar</span><span>'+f(oc.m+s1[3]+DOM)+'</span></div>'+(ai&&ai.vencido?'<p class="mut">⚠️ El recibo parece vencido. Revísalo antes de enviar.</p>':ai&&ai.conf<.75?'<p class="mut">Revisa bien los datos: no estoy del todo seguro.</p>':'')+(V.auto?'<div id="autobar"><div class="bar2"><i></i></div><p class="mut" style="margin:6px 0 0">Enviando a Carlos en unos segundos…</p></div>':'')+'<button class="btn" data-a="vok">🏍️ '+(V.auto?'Enviar ahora a Carlos':'Que Carlos venga por el efectivo')+'</button>';
if(SELF.indexOf(V.svc)>=0){var need=oc.m+s1[3],wb=bal('mon',S.me.cel);h+='<div class="card" style="margin-top:10px;background:var(--bg)"><b>🏠 O hazlo tú desde casa</b><div class="row"><span>Pagas con tu saldo (sin domicilio)</span><span>'+f(need)+'</span></div><div class="row"><span>Tu saldo</span><span>'+f(wb)+'</span></div>'+(wb>=need?'<label for="f_spin">Tu PIN para confirmar</label><input id="f_spin" data-f="spin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" value="'+esc(S.f.spin||'')+'"><button class="btn sec" data-a="vself">Pagar con mi saldo</button>':'<p class="mut">Te faltan '+f(need-wb)+'. Pide una recarga a domicilio o en el Centro.</p>')+'</div>'}
h+='<button class="btn sec" data-a="vfix">'+(V.auto?'Cancelar y corregir':'Corregir')+'</button>'+(V.ai?'':'<p class="mut" style="margin-top:6px">Valor indicado por ti; el domiciliario verificará el recibo.</p>')+'</div>'}
if(V.step!=='reading')h+='<div class="microw"><button class="ic" data-a="vz" aria-label="Activar o silenciar la voz">'+(S.voice?'🔊':'🔇')+'</button><button class="mic'+(S.listening?' on':'')+'" data-a="mic" aria-label="Hablar">🎤</button><button class="ic" data-a="vreset" aria-label="Empezar de nuevo">↺</button></div><div class="live" id="live">'+esc(S.vmsg||'')+'</div><div class="tf"><input id="ti" type="text" placeholder="…o escribe lo que dirías" autocomplete="off"><button class="btn sm" data-a="vsend">Enviar</button></div>';
if(V.step==='idle'){h+='<div class="chips">'+['Quiero pagar la luz','Recargar 20 mil a mi celular','Pagar el SOAT','Pagar el agua'].map(function(x){return '<button class="chip" data-a="say" data-t="'+x+'">“'+x+'”</button>'}).join('')+'<button class="chip" data-a="vhelp">¿Qué puedo decir?</button><button class="chip" data-a="vtest">🔊 Probar audio</button></div><div class="card"><h3>O elígelo de la lista</h3><div class="chips">'+CAT.map(function(c,i){return '<button class="chip'+(S.cat===i?' on':'')+'" data-a="cat" data-i="'+i+'">'+c[1]+' '+c[0]+'</button>'}).join('')+'</div><div class="lst">';
SV.forEach(function(sv,i){if(sv[0]!==S.cat)return;h+='<button class="svc" data-a="svc" data-i="'+i+'"><span>'+sv[2]+' '+sv[1]+'<small>'+(sv[4]===null?'Valor según tu recibo':sv[4]===0?'Gestión sin pago a terceros':'Valor fijo '+f(sv[4]))+'</small></span><span class="mut">'+(SELF.indexOf(i)>=0?'🏠 tú mismo · ':'')+'Comisión '+f(sv[3])+'</span></button>'});
h+='</div></div>'}
}
if(S.ut==='o'){var mine=S.orders.filter(function(o){return o.uid===id&&activeOrder(o)}).slice().reverse();
if(!mine.length)h+='<div class="card mut">No tienes pedidos activos.</div>';else h+=orderHistory(mine)}
if(S.ut==='h'){var history=S.orders.filter(function(o){return o.uid===id&&historyOrder(o)}).slice().reverse();
if(!history.length)h+='<div class="card mut">Todavía no tienes comprobantes anteriores.</div>';else h+=orderHistory(history)}
if(S.ut==='m')h+='<div class="card"><span class="mut">👛 Mi saldo</span><span class="big">'+f(bal('mon',id))+'</span><button class="btn" data-a="wrech">Pedir recarga a domicilio</button><p class="mut" style="margin-top:6px">Con saldo en tu cuenta pagas tú mismo, desde casa, los trámites marcados con 🏠, sin domicilio.</p></div><div class="card"><span class="mut">Total pagado en ChochoPagos</span><span class="big">'+f(-S.L.filter(function(l){return l.role==='u'&&l.who===id&&l.amt<0}).reduce(function(a,l){return a+l.amt},0))+'</span></div><h4>Movimientos</h4>'+led('u',id);
if(S.ut==='r'){var ini=me.name.split(' ').map(function(w){return w[0]}).slice(0,2).join('').toUpperCase();
h+='<div class="card" style="text-align:center"><div class="avatar">'+ini+'</div><h3>'+esc(me.name)+'</h3><div class="mut">Cliente registrado</div></div><div class="card"><div class="row"><span>Celular</span><span>'+me.cel+'</span></div><div class="row"><span>Cédula</span><span>•••• '+me.ced.slice(-3)+'</span></div><div class="row"><span>Sector</span><span>'+esc(me.sector)+'</span></div><div class="row"><span>Indicaciones</span><span style="text-align:right">'+esc(me.dir||'—')+'</span></div><div class="row"><span>Pedidos realizados</span><span>'+S.orders.filter(function(o){return o.uid===id}).length+'</span></div></div>'+faceCard('u',me.cel)+'<button class="btn sec" data-a="logout">Cerrar sesión</button>'}
return h+'</div>'+nav('ut',S.ut,[['p','➕ Pedir'],['o','📦 Pedidos'],['h','🧾 Historial'],['m','💰 Saldos'],['r','👤 Perfil']])+'</div>'}
/* ---------- DOMICILIARIO ---------- */
function dAuth(){return '<div class="phone">'+splash('Acceso para domiciliarios')+'<div class="body"><div class="card"><h3>Inicia tu turno</h3>'+inp('opc','Código de operario','text','Ej: OP-01')+'<div class="gap"></div>'+inp('opp','PIN','password','••••',PIN)+'<button class="btn" data-a="oplogin">Ingresar</button><label class="btn sec" for="faceIn" data-a="fctx" data-i="login" data-r="d">😀 Entrar con mi rostro</label></div><p class="mut" style="text-align:center">Los domiciliarios los registra el Centro. Prueba: OP-01 · PIN 1234</p></div></div>'}
function vD(){
if(!S.op)return dAuth();
var os=S.orders.filter(function(o){return o.s<4}),pe=pend().reduce(function(a,o){return a+o.m+o.fee},0)+S.rcash;
var h='<div class="phone"><div class="bar"><div>🏍️ Carlos · OP-01<br><small>'+os.length+' pedidos activos</small></div><div style="display:flex;gap:8px;align-items:center"><button class="sw'+(S.on?' on':'')+'" data-a="net" style="color:#fff"><span></span>'+(S.on?'Señal':'Sin señal')+'</button><button class="out" data-a="oplogout">Salir</button></div></div>';
if(!S.on)h+='<div class="off">Modo offline: puedes recoger y registrar. '+ChochoSync.label(S)+'.</div>';
h+='<div class="body"><div class="two"><div class="card"><span class="mut">Efectivo en mano</span><b class="big" style="font-size:18px">'+f(bal('efectivo'))+'</b></div><div class="card"><span class="mut">Ganancias</span><b class="big" style="font-size:18px">'+f(bal('ganancia'))+'</b></div></div>';
if(S.dt==='p'){
if(!os.length)h+='<div class="card mut">Sin pedidos activos. Pide uno desde la vista Usuario.</div>';
os.forEach(function(o){var cu=getU(o.uid);
h+='<div class="card"><h3>'+SV[o.sv][2]+' '+nm(o)+' #'+o.id+' <span class="pill p'+o.s+'">'+LB[o.s]+'</span></h3><div class="mut">Ref: '+esc(o.ref)+'</div><div class="mut">Requisitos: '+REQ[o.sv].join(' · ')+'</div>'+(o.ai?'<div class="mut">🤖 Leído del recibo: '+esc(o.ai.empresa||'')+(o.ai.venc?' · vence '+esc(o.ai.venc):'')+' · confianza '+Math.round(o.ai.conf*100)+'%</div>':'')+(o.photo?'<img class="rimg" alt="Recibo del cliente" src="'+o.photo+'">':'')+'<div class="row"><span>Cliente: '+esc(o.u)+'</span><span>Cobrar '+f(tot(o))+'</span></div><div class="row"><span>📍 '+esc(cu.sector)+(cu.dir?' · '+esc(cu.dir):'')+'</span></div><div class="row"><span>📞 '+o.uid+'</span><span>Ganas '+f(DOM)+'</span></div>'+trk(o.s);
if(o.s===0)h+='<button class="btn" data-a="acc" data-i="'+o.id+'">Aceptar pedido</button>';
if(o.s===1){if(!o.arr)h+='<button class="btn" data-a="arr" data-i="'+o.id+'">📍 Llegué a la casa</button>';else h+='<div class="card" style="margin-top:8px;background:var(--bg)"><b>Recibir el efectivo</b><label class="chk" style="display:flex;gap:8px;margin-top:6px"><input type="checkbox" data-a="chk" data-i="'+o.id+'"'+(o.chk?' checked':'')+'><span>Verifiqué el recibo: vigente y el valor coincide</span></label><div class="gap"></div><label for="cash'+o.id+'">Efectivo contado (COP)</label><input id="cash'+o.id+'" type="number" inputmode="numeric" data-k="cash" data-i="'+o.id+'" value="'+esc(S.inp['cash'+o.id]||'')+'" placeholder="Debe ser '+f(tot(o))+'"><div class="gap"></div><label for="code'+o.id+'">Código de entrega del cliente</label><input id="code'+o.id+'" type="text" inputmode="numeric" maxlength="4" data-k="code" data-i="'+o.id+'" value="'+esc(S.inp['code'+o.id]||'')+'" placeholder="4 dígitos"><button class="btn" data-a="rec" data-i="'+o.id+'">Confirmar efectivo recibido</button></div>'}
if(o.s===2){
h+='<div class="card" style="margin-top:8px;background:var(--bg)"><b>📋 Información de la operación</b><p class="mut">Verifica la imagen o completa los datos antes de procesar el pago.</p>';
vFields(o.sv).forEach(function(x){var key=x[0],value=S.inp['opf'+key+o.id]||((o.form||{})[key])||(key==='reference'?o.ref:key==='amount'?o.m:'');h+='<label for="opf'+key+o.id+'">'+x[1]+'</label><input id="opf'+key+o.id+'" type="'+x[2]+'" data-k="opf'+key+'" data-i="'+o.id+'" value="'+esc(value)+'" placeholder="'+x[3]+'">'});
h+='<label for="result'+o.id+'">Respuesta simulada del proveedor</label><select id="result'+o.id+'" data-k="result" data-i="'+o.id+'"><option value="approved"'+(S.inp['result'+o.id]==='rejected'||S.inp['result'+o.id]==='pending'?'':' selected')+'>Aprobado</option><option value="pending"'+(S.inp['result'+o.id]==='pending'?' selected':'')+'>Pendiente de confirmación</option><option value="rejected"'+(S.inp['result'+o.id]==='rejected'?' selected':'')+'>Rechazado</option></select><label class="chk"><input type="checkbox" data-a="opcheck" data-i="'+o.id+'"'+(o.chk?' checked':'')+'><span>Verifiqué los datos y el recibo contra la solicitud</span></label><button class="btn" data-a="opcomplete" data-i="'+o.id+'">Guardar información completa</button></div>';
if(o.opComplete)h+='<p class="st">Información completa. Puedes procesar el pago.</p>';
h+=(S.on&&o.opComplete?'<button class="btn" data-a="payop" data-i="'+o.id+'">'+(o.sv===14?'Acreditar al monedero del cliente':'Hacer el trámite con la app')+'</button>':'<button class="btn" disabled>'+(!S.on?'Sin señal: llévalo al Centro':'Completa y verifica la información')+'</button>')+'<p class="mut" style="margin-top:6px">También puedes llevarlo al Centro Comunitario.</p>';
}
if(o.s===3)h+='<label class="btn" for="evidence'+o.id+'">📸 Tomar foto de evidencia</label><input id="evidence'+o.id+'" class="vh" type="file" accept="image/*" capture="environment" data-evidence="'+o.id+'"><p class="mut" style="margin-top:6px">La entrega se completa después de guardar la evidencia.</p>';
h+='</div>'})}
else{h+='<div class="card"><div class="row"><span>Pendiente de rendir al Centro</span><b>'+f(pe)+'</b></div><button class="btn" data-a="rend"'+(pe?'':' disabled')+'>Rendir caja al Centro</button><p class="mut" style="margin-top:6px">Al rendir, el efectivo de los trámites pagados con la app pasa a la caja del Centro. Tu domicilio lo conservas.</p></div><div class="card"><div class="row"><span>Saldo de plataforma</span><b>'+f(bal('plat'))+'</b></div><p class="mut">Para pagar con la app se necesita saldo suficiente en la plataforma y señal.</p></div>'+rechCard('d')+faceCard('d','OP-01')+'<h4>Movimientos</h4>'+led('d','')}
return h+'</div>'+nav('dt',S.dt,[['p','📦 Pedidos'],['m','💰 Caja y movimientos']])+'</div>'}
/* ---------- CENTRO ---------- */
function cAuth(){return '<div class="tablet">'+splash('Panel del Centro Comunitario')+'<div class="ctr"><div class="card"><h3>Acceso del punto</h3>'+inp('cc','Código del punto','text','Ej: CC-01')+'<div class="gap"></div>'+inp('ccp','PIN','password','••••',PIN)+'<button class="btn" data-a="cclogin">Ingresar</button><label class="btn sec" for="faceIn" data-a="fctx" data-i="login" data-r="c">😀 Entrar con mi rostro</label></div><p class="mut" style="text-align:center;margin-top:8px">Prueba: CC-01 · PIN 1234</p></div></div>'}
function vC(){
if(!S.ce)return cAuth();
var pd=S.orders.filter(function(o){return o.s>=3&&o.s!==5}),dn=S.orders.filter(function(o){return o.s===4&&o.t1});
var avg=dn.length?dn.reduce(function(a,o){return a+(o.t1-o.t0)},0)/dn.length/6e4:0;
var q=S.orders.filter(function(o){return o.s===2||o.s===7});
var h='<div class="tablet"><div class="bar"><div>🏪 Centro Comunitario · CC-01<br><small>Tienda aliada · tablet con internet e impresora</small></div><div style="display:flex;gap:10px;align-items:center"><span>'+new Date().toLocaleDateString('es-CO')+'</span><button class="out" data-a="cclogout">Salir</button></div></div>';
h+='<div class="kpis"><div class="card kpi"><b>'+pd.length+'</b><span>Transacciones realizadas</span></div><div class="card kpi"><b>'+f(pd.reduce(function(a,o){return a+o.m},0))+'</b><span>Monto procesado</span></div><div class="card kpi"><b>'+f(bal('com'))+'</b><span>Comisiones ganadas</span></div><div class="card kpi"><b>'+(dn.length?avg.toFixed(0)+' min':'—')+'</b><span>Tiempo promedio de atención</span></div><div class="card kpi"><b>'+S.users.length+'</b><span>Usuarios registrados</span></div></div>';
h+='<div class="pad"><div class="two"><div class="card"><h3>💰 Saldo de plataforma</h3><b class="big">'+f(bal('plat'))+'</b><button class="btn sm" style="margin-top:8px" data-a="rech">Recargar $200.000</button></div><div class="card"><h3>🗄️ Caja (efectivo)</h3><b class="big">'+f(bal('caja'))+'</b><p class="mut">Efectivo recibido de domiciliarios</p></div><div class="card"><h3>🖨️ Papel</h3><b class="big">'+S.papel+' hojas</b><p class="mut">'+(S.papel<30?'⚠️ Stock bajo, reponer':'Stock suficiente')+'</p></div></div>';
h+=rechCard('c')+faceCard('c','CC-01');
h+='<h3>Cola de pagos en el Centro ('+q.length+')</h3>';
if(!q.length)h+='<div class="card mut">No hay pagos pendientes. Aquí llegan los pedidos recogidos cuando no hay señal.</div>';
q.forEach(function(o){h+='<div class="card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><b>#'+o.id+' '+nm(o)+'</b><div class="mut">'+esc(o.u)+' · Ref '+esc(o.ref)+' · '+f(o.m)+'</div><span class="pill p'+o.s+'">'+LB[o.s]+'</span>'+(o.failure?'<div class="mut">'+esc(o.failure)+'</div>':'')+(o.photo?'<img class="rimg" style="max-height:80px;width:auto" alt="Recibo" src="'+o.photo+'">':'')+'</div><div><label for="cenresult'+o.id+'">Resultado</label><select id="cenresult'+o.id+'" data-k="result" data-i="'+o.id+'"><option value="approved"'+(S.inp['result'+o.id]==='rejected'||S.inp['result'+o.id]==='pending'?'':' selected')+'>Aprobado</option><option value="pending"'+(S.inp['result'+o.id]==='pending'?' selected':'')+'>Pendiente</option><option value="rejected"'+(S.inp['result'+o.id]==='rejected'?' selected':'')+'>Rechazado</option></select><button class="btn sm" data-a="paycen" data-i="'+o.id+'">'+(o.s===7?'Reintentar e imprimir':'Procesar e imprimir')+'</button></div></div>'});
h+='<h3>Transacciones</h3><div class="tw card"><table><tr><th>#</th><th>Cliente</th><th>Trámite</th><th>Valor</th><th>Comisión</th><th>Total cobrado</th><th>Estado</th><th>Vía</th><th>Recibo</th></tr>';
S.orders.slice().reverse().forEach(function(o){h+='<tr><td>'+o.id+'</td><td>'+esc(o.u)+'</td><td>'+nm(o)+'</td><td>'+f(o.m)+'</td><td>'+f(o.fee)+'</td><td>'+f(tot(o))+'</td><td><span class="pill p'+o.s+'">'+LB[o.s]+'</span></td><td>'+by(o)+'</td><td>'+(o.photo?'<img alt="Recibo" src="'+o.photo+'" style="width:40px;height:40px;object-fit:cover;border-radius:6px">':'—')+'</td></tr>'});
h+='</table></div><h3>Usuarios registrados</h3><div class="tw card"><table><tr><th>Nombre</th><th>Celular</th><th>Sector</th><th>Pedidos</th></tr>'+S.users.map(function(u){return '<tr><td>'+esc(u.name)+'</td><td>'+u.cel+'</td><td>'+esc(u.sector)+'</td><td>'+S.orders.filter(function(o){return o.uid===u.cel}).length+'</td></tr>'}).join('')+'</table></div>';
h+='<h3>Movimientos de saldos</h3>'+led('c','',30);
h+='<h3>Tarifario</h3><details class="card"><summary>Ver tarifas por trámite (editable en la versión real)</summary><div class="tw"><table><tr><th>Categoría</th><th>Trámite</th><th>Valor</th><th>Comisión</th></tr>'+SV.map(function(s){return '<tr><td>'+CAT[s[0]][0]+'</td><td>'+s[2]+' '+s[1]+'</td><td>'+(s[4]===null?'Libre':f(s[4]))+'</td><td>'+f(s[3])+'</td></tr>'}).join('')+'<tr><td colspan="3">Domicilio (todos)</td><td>'+f(DOM)+'</td></tr></table></div></details>';
return h+'</div></div>'}
function cap(t,x){return '<div class="col"><div class="cap">'+t+'</div>'+x+'</div>'}
function render(){
var sc=[].map.call(document.querySelectorAll('.body'),function(b){return b.scrollTop});
var T=[['u','👩 Usuario'],['d','🏍️ Domiciliario'],['c','🏪 Centro Comunitario'],['a','👀 Ver los tres']];
el('tabs').innerHTML=T.map(function(t){return '<button class="'+(S.tab===t[0]?'on':'')+'" data-a="tab" data-i="'+t[0]+'">'+t[1]+'</button>'}).join('');
el('stage').innerHTML=S.tab==='u'?cap('Lo que ve el usuario',vU()):S.tab==='d'?cap('Lo que ve el domiciliario',vD()):S.tab==='c'?cap('Lo que ve el centro',vC()):cap('Usuario',vU())+cap('Domiciliario',vD())+cap('Centro Comunitario',vC());
[].forEach.call(document.querySelectorAll('.body'),function(b,i){if(sc[i])b.scrollTop=sc[i]});
if(S.vb){[].forEach.call(document.querySelectorAll('.body[data-vb]'),function(b){b.scrollTop=b.scrollHeight});S.vb=false}}
function oid(i){return S.orders.filter(function(o){return o.id===+i})[0]}
function setf(e){var t=e.target;if(t.dataset&&t.dataset.k)S.inp[t.dataset.k+t.dataset.i]=t.value;if(t.dataset&&t.dataset.vf)S.v.fields[t.dataset.vf]=t.value;if(t.id==='amt')S.amt=t.value;if(t.id==='ref')S.ref=t.value;if(t.dataset&&t.dataset.f)S.f[t.dataset.f]=t.type==='checkbox'?t.checked:t.value}
document.addEventListener('input',setf);document.addEventListener('change',setf);
document.addEventListener('click',function(e){var b=e.target.closest('[data-a]');if(!b)return;var a=b.dataset.a,i=b.dataset.i,o=oid(i);
if(a==='tab')S.tab=i;
else if(a==='ut'){S.ut=i;if(i!=='o')S.orderView=null}
else if(a==='dt')S.dt=i;
else if(a==='order'){S.orderView=+i}
else if(a==='closeOrder'){S.orderView=null}
else if(a==='mode'){S.mode=i}
else if(a==='login'){var u=S.users.filter(function(x){return x.cel===S.f.cel.trim()&&x.pin===S.f.pin})[0];if(!u){toast('Celular o PIN incorrectos');return}loginUser(u)}
else if(a==='reg'){var F=S.f,er='';
if(F.name.trim().length<5)er='Escribe tu nombre completo';else if(!/^\d{6,10}$/.test(F.ced))er='La cédula debe tener entre 6 y 10 números';else if(!/^3\d{9}$/.test(F.cel))er='El celular debe tener 10 números y empezar por 3';else if(S.users.some(function(x){return x.cel===F.cel}))er='Ese celular ya está registrado. Ingresa a tu cuenta';else if(!/^\d{4}$/.test(F.pin))er='El PIN debe tener 4 números';else if(F.pin!==F.pin2)er='Los PIN no coinciden';else if(!F.ok)er='Debes aceptar el tratamiento de datos';
if(er){toast(er);render();return}
var nu={name:F.name.trim(),ced:F.ced,cel:F.cel,sector:F.sector,dir:F.dir.trim(),pin:F.pin};S.users.push(nu);S.me=nu;S.ut='p';S.v=newV();S.f={cel:'',pin:'',pin2:'',name:'',ced:'',sector:'Alto del Chocho',dir:'',ok:false,opc:'',opp:'',cc:'',ccp:''};toast('Cuenta creada. Activa el ingreso con rostro en Perfil.')}
else if(a==='logout'){S.me=null;S.mode='login';S.cat=0;S.svc=null;toast('Sesión cerrada')}
else if(a==='oplogin'){if(S.f.opc.trim().toUpperCase()==='OP-01'&&S.f.opp==='1234'){S.op=true;S.f.opp='';toast('Turno iniciado')}else{toast('Código o PIN incorrectos');return}}
else if(a==='oplogout'){S.op=false;toast('Turno cerrado')}
else if(a==='cclogin'){if(S.f.cc.trim().toUpperCase()==='CC-01'&&S.f.ccp==='1234'){S.ce=true;S.f.ccp='';toast('Bienvenido al panel')}else{toast('Código o PIN incorrectos');return}}
else if(a==='cclogout'){S.ce=false;toast('Sesión cerrada')}
else if(a==='cat'){S.cat=+i;S.svc=null}
else if(a==='svc'){vlog('u',SV[+i][1]);vSetSvc(+i,null)}
else if(a==='provider'){vChooseProvider(i)}
else if(a==='package'){vChoosePackage(i,parseInt(b.dataset.t,10)||0)}
else if(a==='vchoose'){vChooseMode(i)}
else if(a==='vrec'){vRechargeSubmit()}
else if(a==='vform'){vFormSubmit()}
else if(a==='mic'){listen();return}
else if(a==='say'){hv(b.dataset.t,true)}
else if(a==='vz'){S.voice=!S.voice;if(!S.voice&&window.speechSynthesis)speechSynthesis.cancel();toast(S.voice?'Voz activada':'Voz silenciada')}
else if(a==='vok'){vplace()}
else if(a==='vfix'){var Vfix=S.v;Vfix.hold=true;if(Vfix.svc===14){Vfix.step='form';vsay('Puedes modificar el valor de la recarga.')}else if(Vfix.svc===4){Vfix.step='recharge';vsay('Puedes modificar el valor de la recarga para '+Vfix.provider+'.')}else if(Vfix.svc===5){Vfix.step='package';vsay('Puedes cambiar el paquete de '+Vfix.provider+'.')}else if(Vfix.inputMode==='form'||Vfix.inputMode==='voice'){Vfix.step='form';vsay('Puedes modificar los datos del formulario de '+SV[Vfix.svc][1]+'.')}else{Vfix.step='choose';vsay('Puedes volver a tomar la foto o escribir los datos del servicio.')}}
else if(a==='vreset'){S.v=newV();if(window.speechSynthesis)speechSynthesis.cancel()}
else if(a==='net'){S.on=!S.on;if(S.on){var synced=ChochoSync.reconnect(S);toast('Señal recuperada. '+synced+' operación(es) sincronizada(s)')}else toast('Sin señal: modo offline')}
else if(a==='acc')o.s=1;
else if(a==='fctx'){var fr=b.dataset.r,fk='';
if(i==='enroll')fk=fr==='u'?S.me.cel:fr==='d'?'OP-01':'CC-01';
else if(fr==='u'){var uu=S.users.filter(function(x){return x.cel===S.f.cel.trim()})[0];if(!uu){e.preventDefault();toast('Escribe tu celular primero');return}fk=uu.cel}
else if(fr==='d'){if(S.f.opc.trim().toUpperCase()!=='OP-01'){e.preventDefault();toast('Escribe tu código de operario primero');return}fk='OP-01'}
else{if(S.f.cc.trim().toUpperCase()!=='CC-01'){e.preventDefault();toast('Escribe el código del punto primero');return}fk='CC-01'}
if(i==='login'&&!S.faces[fk]){e.preventDefault();toast('Aún no registraste tu rostro. Entra con tu PIN y actívalo en tu perfil.');return}
FC={mode:i,key:fk,r:fr};return}
else if(a==='rch'){var rr=b.dataset.r,pk=rr==='d'?['rcel','ramt','rok']:['ccel','camt','cok'],rc=(S.f[pk[0]]||'').trim(),ra=parseInt(S.f[pk[1]],10)||0,ru=S.users.filter(function(x){return x.cel===rc})[0];
if(!ru){toast('No hay un usuario con ese celular');return}
if(ra<1000||ra>500000){toast('El valor debe estar entre $1.000 y $500.000');return}
if(!S.f[pk[2]]){toast('Confirma que verificaste su identidad con la cédula');return}
if(rr==='d'){mv('d','efectivo','Efectivo recibido para recarga de '+ru.name,ra,0,'');S.rcash+=ra}else mv('c','caja','Efectivo recibido para recarga de '+ru.name,ra,0,'');
mv('u','mon','Recarga de saldo en efectivo ('+(rr==='d'?'domiciliario':'Centro')+')',ra,0,ru.cel);
S.f[pk[1]]='';S.f[pk[2]]=false;toast('Cuenta de '+fn(ru)+' recargada con '+f(ra));
if(S.me&&S.me.cel===ru.cel&&(S.tab==='u'||S.tab==='a'))speak('Tu cuenta fue recargada con '+sp(ra)+'.')}
else if(a==='arr'){o.arr=true;toast('Verifica el recibo y recibe el efectivo')}
else if(a==='cancel'){if(!o||o.s>=2){toast('Este pedido ya no se puede cancelar');return}o.s=5;o.cancelledAt=Date.now();toast('Pedido #'+o.id+' cancelado')}
else if(a==='chk'){o.chk=!o.chk}
else if(a==='opcheck'){o.chk=!o.chk}
else if(a==='opcomplete'){var fs=vFields(o.sv),data={},missing=[];fs.forEach(function(x){var value=opFieldValue(o,x[0],i).trim();data[x[0]]=value;if(x[0]!=='concept'&&!value)missing.push(x[1])});if(!o.chk){toast('Marca que verificaste los datos');return}if(missing.length){toast('Falta: '+missing[0]);return}var opamt=parseInt(data.amount,10)||SV[o.sv][4]||0;if(opamt<1000&&o.sv!==12){toast('Escribe un valor válido');return}o.form=data;o.ref=data.reference||data.account||data.phone||data.document||o.ref;o.m=SV[o.sv][4]!==null?SV[o.sv][4]:opamt;o.opData={fields:data,verifiedAt:Date.now()};o.opComplete=true;toast('Información de la operación guardada')}
else if(a==='vself'){vself()}
else if(a==='wrech'){S.ut='p';S.v=newV();vlog('u','Quiero recargar mi monedero');vSetSvc(14,null)}
else if(a==='vsend'){var ti=el('ti');if(ti&&ti.value.trim()){var tv=ti.value;ti.value='';hv(tv)}}
else if(a==='vtest'){if(!window.speechSynthesis){toast('Este navegador no tiene voz de respuesta');return}speak('Hola, soy ChochoPagos. Si me escuchas, el audio funciona.',true);toast('Reproduciendo… si no oyes nada, sube el volumen o quita el modo silencio');return}
else if(a==='vhelp'){vHelp();return}
else if(a==='scan'){o.scan=true;toast('Factura escaneada')}
else if(a==='rec'){var cash=parseInt(S.inp['cash'+i],10)||0;
if(!o.chk){toast('Verifica el recibo antes de recibir el efectivo');return}
if(cash!==tot(o)){toast(cash<tot(o)?'Faltan '+f(tot(o)-cash)+' para completar':'Sobran '+f(cash-tot(o))+'. Devuelve el cambio');return}
if((S.inp['code'+i]||'')!==o.code){toast('El código del cliente no coincide');return}
collect(o);toast('Efectivo recibido: '+f(cash))}
else if(a==='payop'){if(!S.on){toast('Sin señal');return}var opResult=processPay(o,'app');toast(opResult==='approved'?'Trámite #'+o.id+' realizado':opResult==='pending'?'Trámite #'+o.id+' pendiente de confirmación':opResult==='unavailable'?'Saldo de plataforma insuficiente. Recarga en el Centro.':'Trámite #'+o.id+' rechazado por el proveedor')}
else if(a==='paycen'){var centerResult=processPay(o,'centro');toast(centerResult==='approved'?'Trámite #'+o.id+' procesado en el Centro':centerResult==='pending'?'Trámite #'+o.id+' pendiente de confirmación':centerResult==='unavailable'?'Saldo de plataforma insuficiente. Recarga en el Centro.':'Trámite #'+o.id+' rechazado por el proveedor')}
else if(a==='del'){deliver(o);toast('Entregado con evidencia')}
else if(a==='rend'){var p=pend();if(!p.length&&!S.rcash){toast('Nada por rendir');return}
var x=p.reduce(function(s,o){return s+o.m+o.fee},0)+S.rcash;S.rcash=0;
mv('d','efectivo','Rendición de caja al Centro'+(p.length?' (#'+p.map(function(o){return o.id}).join(', #')+')':''),-x,0,'');
mv('c','caja','Efectivo recibido de Carlos (rendición)',x,0,'');
p.forEach(function(o){o.rend=true});toast('Caja rendida: '+f(x))}
else if(a==='rech'){mv('c','plat','Recarga de saldo desde banco',200000,0,'');toast('Saldo recargado')}
else if(a==='reset'){var t=S.tab;if(window.speechSynthesis)speechSynthesis.cancel();VT.forEach(clearTimeout);ChochoStorage.clear(STORE);init();S.tab=t;toast('Demo reiniciada')}
if(o&&!S.on&&['acc','arr','chk','opcheck','opcomplete','rec'].indexOf(a)>=0)queueOrder(o);notify();notifyOp();persistDemo();render()});
document.addEventListener('change',function(e){if(e.target.id==='cam'||e.target.id==='gal')vPhoto(e.target.files[0]);if(e.target.id==='faceIn')processFace(e.target.files[0]);if(e.target.dataset.evidence)evidence(e.target.files[0],+e.target.dataset.evidence)});
document.addEventListener('focusin',function(e){if(e.target.id==='f_spin'&&S.v){S.v.hold=true;var ab=el('autobar');if(ab)ab.style.display='none'}});
document.addEventListener('keydown',function(e){if(e.target.id==='ti'&&e.key==='Enter'){var v=e.target.value.trim();if(v){e.target.value='';hv(v);render()}}});
var UNL=0;document.addEventListener('click',function(){if(!UNL&&window.speechSynthesis){UNL=1;try{var u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}catch(e){}}});
render();
