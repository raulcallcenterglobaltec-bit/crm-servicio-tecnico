
let financePayments=[];
let financeLoadError=null;
function companyHasWorkFinance(){return currentCompany?.show_work_finance===true;}
async function loadFinanceData(companyId){
  financeLoadError=null;financePayments=[];
  const result=await db.from('notice_payments').select('*').eq('company_id',companyId).order('paid_at',{ascending:false});
  if(result.error){financeLoadError=errorText(result.error);console.error('No se pudieron cargar los pagos',result.error);return;}
  financePayments=result.data||[];
}
function applyCompanyModules(){
  const work=companyHasWorkFinance(),fixed=currentCompany?.show_tariff_reports!==false;
  document.querySelectorAll('[data-work-finance-only]').forEach(el=>el.hidden=!work);
  document.querySelectorAll('[data-fixed-tariff-only]').forEach(el=>el.style.display=fixed?'':'none');
  if(!work&&document.querySelector('#page-cobros.active'))showPage('avisos-landing');
}
function financeExistingNoticeIds(){return new Set(notices.filter(n=>n.notice_type==='aviso').map(n=>n.id));}
function financePaymentsForExistingNotices(){const validIds=financeExistingNoticeIds();return financePayments.filter(p=>validIds.has(p.notice_id));}
function financePaymentsFor(noticeId){return financePayments.filter(p=>p.notice_id===noticeId);}
function financePaidTotal(noticeId){return financePaymentsFor(noticeId).reduce((sum,p)=>sum+Number(p.amount||0),0);}
function financeState(notice){
  if(notice.work_amount===null||notice.work_amount===undefined||notice.work_amount==='')return 'Sin importe';
  const amount=Number(notice.work_amount),paid=financePaidTotal(notice.id);
  if(amount<=0)return 'Cobrado';
  if(paid>=amount-.005)return 'Cobrado';
  if(paid>0)return 'Parcial';
  return 'Pendiente';
}
function financeToday(){return localDateKey(new Date());}
function financeDateOnly(value){return String(value||'').slice(0,10);}
function financeRange(){
  const period=$('#financePeriod')?.value||'30d',today=financeToday(),now=new Date(today+'T12:00:00');
  if(period==='all')return {from:'0001-01-01',to:'9999-12-31'};
  if(period==='today')return {from:today,to:today};
  if(period==='week'){const from=new Date(now);from.setDate(from.getDate()-(from.getDay()+6)%7);return {from:financeDateOnly(from.toISOString()),to:today};}
  if(period==='month')return {from:today.slice(0,8)+'01',to:today};
  if(period==='range')return {from:$('#financeDateFrom')?.value||'0001-01-01',to:$('#financeDateTo')?.value||'9999-12-31'};
  const from=new Date(now);from.setDate(from.getDate()-29);return {from:financeDateOnly(from.toISOString()),to:today};
}
function financeNoticeDate(n){return financeDateOnly(n.work_completed_at||n.managed_at||n.received_at);}
function financePeriodRows(){const r=financeRange();return notices.filter(n=>n.notice_type==='aviso'&&n.status==='Sale'&&financeNoticeDate(n)>=r.from&&financeNoticeDate(n)<=r.to);}
function financeMoneyValue(value){return value===null||value===undefined||value===''?null:Number(value);}
function financeFmtDate(value){if(!value)return '—';const d=new Date(String(value).slice(0,10)+'T12:00:00');return Number.isNaN(d.valueOf())?String(value):d.toLocaleDateString('es-ES');}
function financePeriodPayments(range){
  const byNotice=new Map();
  for(const payment of financePaymentsForExistingNotices().filter(p=>p.paid_at>=range.from&&p.paid_at<=range.to))
    byNotice.set(payment.notice_id,(byNotice.get(payment.notice_id)||0)+Number(payment.amount||0));
  return byNotice;
}
function renderFinanceDrilldown(kind,rangeRows,range){
  const panel=$('#financeDrilldown');if(!panel||!panel.dataset.kind)return;
  const paidInPeriod=financePeriodPayments(range);
  let title='',rows=[];
  if(kind==='gross'){title='Detalle del importe de trabajos';rows=rangeRows;}
  else if(kind==='collected'){title='Trabajos con pagos recibidos en el periodo';rows=notices.filter(n=>n.notice_type==='aviso'&&paidInPeriod.has(n.id));}
  else if(kind==='outstanding'){title='Trabajos pendientes de cobro';rows=rangeRows.filter(n=>n.work_amount!=null&&Number(n.work_amount)-financePaidTotal(n.id)>.005);}
  else if(kind==='profit'){title='Detalle del beneficio estimado';rows=rangeRows.filter(n=>n.work_amount!=null);}
  panel.hidden=false;
  $('#financeDrilldownTitle').textContent=title;
  $('#financeDrilldownRows').innerHTML=rows.length?rows.map(n=>{
    const amount=n.work_amount==null?null:Number(n.work_amount),paid=financePaidTotal(n.id),balance=amount===null?null:Math.max(amount-paid,0),paidPeriod=paidInPeriod.get(n.id)||0;
    const expenses=Number(n.material_cost||0)+Number(n.other_cost||0),profit=amount===null?null:amount-expenses,state=financeState(n),stateClass=state==='Cobrado'?'paid':state==='Parcial'?'partial':state==='Sin importe'?'unset':'';
    const details=[n.device,n.locality,financeFmtDate(financeNoticeDate(n))].filter(Boolean).map(esc).join(' · ');
    return '<article class="finance-drill-row"><div class="finance-drill-client"><div><strong>'+esc(n.customer_name||'Cliente sin nombre')+'</strong><small>'+esc(n.phone||'Sin teléfono')+(details?' · '+details:'')+'</small></div><span class="finance-state '+stateClass+'">'+esc(state)+'</span></div><div class="finance-drill-values"><span>Trabajo <b>'+(amount===null?'Sin importe':money(amount))+'</b></span><span>Cobrado total <b>'+money(paid)+'</b></span><span>En este periodo <b>'+money(paidPeriod)+'</b></span><span>Pendiente <b>'+(balance===null?'—':money(balance))+'</b></span><span>Gastos <b>'+money(expenses)+'</b></span><span>Beneficio <b>'+(profit===null?'—':money(profit))+'</b></span></div></article>';
  }).join(''):'<div class="finance-empty">No hay trabajos en este desglose para el periodo y los filtros seleccionados.</div>';
}
function renderFinance(){
  const root=$('#page-cobros');if(!root)return;
  if(financeLoadError){$('#financeJobs').innerHTML='<div class="finance-empty">No se pudieron cargar los pagos: '+esc(financeLoadError)+'</div>';return;}
  const range=financeRange(),rangeRows=financePeriodRows(),search=($('#financeSearch')?.value||'').trim().toLocaleLowerCase(),status=$('#financeStatus')?.value||'all';
  const periodPayments=financePaymentsForExistingNotices().filter(p=>p.paid_at>=range.from&&p.paid_at<=range.to);
  const collectedInRange=periodPayments.reduce((sum,p)=>sum+Number(p.amount||0),0);
  const gross=rangeRows.reduce((sum,n)=>sum+(n.work_amount==null?0:Number(n.work_amount||0)),0);
  const materials=rangeRows.reduce((sum,n)=>sum+Number(n.material_cost||0),0),other=rangeRows.reduce((sum,n)=>sum+Number(n.other_cost||0),0);
  const outstanding=rangeRows.reduce((sum,n)=>sum+(n.work_amount==null?0:Math.max(Number(n.work_amount||0)-financePaidTotal(n.id),0)),0);
  const outstandingCount=rangeRows.filter(n=>n.work_amount!=null&&financePaidTotal(n.id)<Number(n.work_amount||0)-.005).length;
  $('#financeGross').textContent=money(gross);$('#financeCollected').textContent=money(collectedInRange);$('#financeOutstanding').textContent=money(outstanding);
  $('#financeOutstandingCount').textContent=outstandingCount+' '+(outstandingCount===1?'trabajo':'trabajos');$('#financeProfit').textContent=money(gross-materials-other);
  renderFinanceDrilldown($('#financeDrilldown')?.dataset.kind,rangeRows,range);
  const matches=rangeRows.filter(n=>{const hay=[n.customer_name,n.phone,n.locality,n.issue,landingName(n.landing_id)].join(' ').toLocaleLowerCase();return (!search||hay.includes(search))&&(status==='all'||financeState(n)===status);});
  $('#financeResultCount').textContent=matches.length+' '+(matches.length===1?'trabajo':'trabajos')+' · '+rangeRows.length+' en el periodo';
  $('#financeJobs').innerHTML=matches.length?matches.map(n=>{
    const payments=financePaymentsFor(n.id),paid=financePaidTotal(n.id),amount=n.work_amount==null?null:Number(n.work_amount),balance=amount===null?null:Math.max(amount-paid,0),state=financeState(n);
    const css=state==='Cobrado'?'paid':state==='Parcial'?'partial':state==='Sin importe'?'unset':'';
    const detail=[n.device,n.locality,n.issue].filter(Boolean).join(' · ');
    const paymentHtml=payments.length?'<div class="finance-payment-list">'+payments.map(p=>'<div>Pago '+financeFmtDate(p.paid_at)+' · '+money(p.amount)+(p.note?' · '+esc(p.note):'')+(canManageCurrentNotices()?' <button type="button" class="mini-delete" data-finance-delete-payment="'+esc(p.id)+'" aria-label="Eliminar pago" title="Eliminar pago">×</button>':'')+'</div>').join('')+'</div>':'';
    const actions=(canManageCurrentNotices()?'<button type="button" class="primary-btn" data-finance-edit="'+esc(n.id)+'">'+(amount===null?'Añadir importe y gastos':'Editar facturación y gastos')+'</button>'+(amount!==null&&balance>0?'<button type="button" class="outline-btn" data-finance-payment="'+esc(n.id)+'">Registrar pago</button>':''):'')+'<button type="button" class="outline-btn" data-finance-detail="'+esc(n.id)+'">Ver aviso</button>';
    return '<article class="finance-job"><div class="finance-job-head"><div><strong>'+esc(n.customer_name||'Cliente sin nombre')+'</strong><div class="finance-job-sub">'+esc(n.phone||'Sin teléfono')+' · '+esc(n.landing_id?landingName(n.landing_id):'Llamada telefónica')+' · '+financeFmtDate(financeNoticeDate(n))+'</div></div><span class="finance-state '+css+'">'+esc(state)+'</span></div>'+(detail?'<div class="finance-job-sub" style="margin-top:8px">'+esc(detail)+'</div>':'')+'<div class="finance-job-meta"><div><span>Importe trabajo</span><strong>'+(amount===null?'Sin completar':money(amount))+'</strong></div><div><span>Recibido / pendiente</span><strong>'+money(paid)+(balance===null?'':' / '+money(balance))+'</strong></div><div><span>Gasto materiales</span><strong>'+money(n.material_cost||0)+'</strong></div><div><span>Otros gastos</span><strong>'+money(n.other_cost||0)+'</strong></div><div><span>Factura</span><strong>'+(n.invoice_issued?'Sí · '+financeFmtDate(n.invoice_date)+(n.invoice_number?' · Nº '+esc(n.invoice_number):''):'No')+'</strong></div><div><span>Gastos anotados</span><strong>'+money(Number(n.material_cost||0)+Number(n.other_cost||0))+'</strong></div></div>'+paymentHtml+'<div class="finance-job-actions">'+actions+'</div></article>';
  }).join(''):'<div class="finance-empty">No hay trabajos que coincidan con los filtros.</div>';
  const cards=[['Importe de trabajos',money(gross)],['Gastos de materiales',money(materials)],['Otros gastos',money(other)],['Beneficio estimado',money(gross-materials-other)],['Cobrado dentro del periodo',money(collectedInRange)],['Pendiente de cobro',money(outstanding)],['Trabajos sin importe',String(rangeRows.filter(n=>n.work_amount==null).length)],['Pagos registrados',String(periodPayments.length)]];
  $('#financeReportRows').innerHTML=cards.map(row=>'<div class="finance-report-tile"><span>'+esc(row[0])+'</span><strong>'+esc(row[1])+'</strong></div>').join('')+'<div class="finance-report-note">El importe de trabajos se agrupa por fecha de realización; los cobros, por fecha de pago. Beneficio estimado = importe de trabajos − gastos registrados.</div>';
  root.querySelectorAll('[data-finance-edit]').forEach(b=>b.onclick=()=>openFinanceDetails(b.dataset.financeEdit));
  root.querySelectorAll('[data-finance-payment]').forEach(b=>b.onclick=()=>openFinancePayment(b.dataset.financePayment));
  root.querySelectorAll('[data-finance-delete-payment]').forEach(b=>b.onclick=()=>deleteFinancePayment(b.dataset.financeDeletePayment));
  root.querySelectorAll('[data-finance-detail]').forEach(b=>b.onclick=()=>showDetails(b.dataset.financeDetail));
}
async function openFinanceDetails(noticeId){
  if(!canManageCurrentNotices())return;const n=notices.find(item=>item.id===noticeId);if(!n)return;
  const ans=await formDialog({title:'Facturación y gastos del trabajo',description:'Indica el importe total a cobrar, si lleva factura y los gastos. Si el cliente ya ha pagado algo, anótalo también; los siguientes pagos se añaden con «Registrar pago».',fields:[
    {key:'work_amount',label:'Importe total a cobrar al cliente (€)',type:'number',value:n.work_amount??''},
    {key:'work_completed_at',label:'Fecha del trabajo',type:'date',value:financeNoticeDate(n)},
    {key:'invoice_issued',label:'Con factura (déjalo desmarcado si va sin factura)',type:'checkbox',value:n.invoice_issued===true},
    {key:'invoice_date',label:'Fecha de factura',type:'date',value:n.invoice_date||''},
    {key:'invoice_number',label:'Número de factura (opcional)',value:n.invoice_number||''},
    {key:'material_cost',label:'Gasto de materiales (€)',type:'number',value:n.material_cost??0},
    {key:'other_cost',label:'Otros gastos (€)',type:'number',value:n.other_cost??0},
    {key:'other_cost_note',label:'Detalle de otros gastos (gasolina, comida, etc.)',type:'textarea',value:n.other_cost_note||''},
    {key:'amount_received_now',label:'Importe cobrado ahora (€), si ya ha pagado',type:'number',value:''},
    {key:'payment_date_now',label:'Fecha de ese cobro',type:'date',value:financeToday()}
  ],confirmText:'Guardar facturación'});
  if(!ans)return;
  const amount=financeMoneyValue(ans.work_amount),materials=Number(ans.material_cost||0),other=Number(ans.other_cost||0),received=Number(ans.amount_received_now||0);
  if((amount!==null&&amount<0)||materials<0||other<0||received<0){toast('Los importes no pueden ser negativos.','Revisa los datos');return;}
  if(amount!==null&&amount+.005<financePaidTotal(n.id)){toast('El importe del trabajo no puede ser menor que lo que ya se ha cobrado.','Revisa los datos');return;}
  if(received>0&&(amount===null||received>amount-financePaidTotal(n.id)+.005)){toast('El cobro de ahora no puede superar lo que queda pendiente.','Revisa los datos');return;}
  const payload={work_amount:amount,work_completed_at:ans.work_completed_at||financeNoticeDate(n),invoice_issued:!!ans.invoice_issued,invoice_date:ans.invoice_issued?(ans.invoice_date||null):null,invoice_number:ans.invoice_issued?(ans.invoice_number.trim()||null):null,material_cost:materials,other_cost:other,other_cost_note:other?(ans.other_cost_note.trim()||null):null};
  const result=await db.from('notices').update(payload).eq('id',n.id).eq('company_id',currentCompany.id).select().single();
  if(result.error){toast(errorText(result.error),'No se pudieron guardar los datos');return;}
  Object.assign(n,result.data);
  if(received>0){
    const paymentResult=await db.from('notice_payments').insert({company_id:currentCompany.id,notice_id:n.id,amount:received,paid_at:ans.payment_date_now||financeToday(),note:null}).select().single();
    if(paymentResult.error){renderFinance();toast('La facturación y los gastos se guardaron, pero el cobro no: '+errorText(paymentResult.error),'Cobro pendiente de guardar');return;}
    financePayments.unshift(paymentResult.data);
  }
  renderFinance();renderReport();toast(received>0?'Facturación, gastos y cobro guardados.':'Facturación y gastos guardados.');
}
async function openFinancePayment(noticeId){
  if(!canManageCurrentNotices())return;const n=notices.find(item=>item.id===noticeId);if(!n||n.work_amount==null)return;
  const balance=Math.max(Number(n.work_amount)-financePaidTotal(n.id),0);
  const ans=await formDialog({title:'Registrar pago',description:'Pendiente de cobro: '+money(balance)+'.',fields:[
    {key:'amount',label:'Importe recibido (€)',type:'number',required:true,value:balance},
    {key:'paid_at',label:'Fecha del pago',type:'date',required:true,value:financeToday()},
    {key:'note',label:'Nota (opcional)',value:''}
  ],confirmText:'Guardar pago'});
  if(!ans)return;
  if(!Number.isFinite(ans.amount)||ans.amount<=0||ans.amount>balance+.005){toast('Introduce un pago mayor que 0 y no superior a '+money(balance)+'.','Importe no válido');return;}
  const result=await db.from('notice_payments').insert({company_id:currentCompany.id,notice_id:n.id,amount:ans.amount,paid_at:ans.paid_at||financeToday(),note:ans.note.trim()||null}).select().single();
  if(result.error){toast(errorText(result.error),'No se pudo guardar el pago');return;}
  financePayments.unshift(result.data);renderFinance();toast('Pago registrado.');
}
async function deleteFinancePayment(paymentId){
  if(!canManageCurrentNotices()||!await confirmDialog('Se eliminará este pago del historial y se recalculará el pendiente de cobro.'))return;
  const result=await db.from('notice_payments').delete().eq('id',paymentId).eq('company_id',currentCompany.id);
  if(result.error){toast(errorText(result.error),'No se pudo eliminar el pago');return;}
  financePayments=financePayments.filter(p=>p.id!==paymentId);renderFinance();toast('Pago eliminado.');
}
function exportFinanceReport(){
  const rows=financePeriodRows(),cols=['Fecha trabajo','Cliente','Teléfono','Origen','Estado de cobro','Importe trabajo','Cobrado total','Pendiente','Factura','Fecha factura','Nº factura','Gasto materiales','Otros gastos','Detalle otros gastos','Beneficio estimado'];
  const data=rows.map(n=>[financeNoticeDate(n),n.customer_name,n.phone,n.landing_id?landingName(n.landing_id):'Teléfono',financeState(n),n.work_amount??'',financePaidTotal(n.id),n.work_amount==null?'':Math.max(Number(n.work_amount)-financePaidTotal(n.id),0),n.invoice_issued?'Sí':'No',n.invoice_date||'',n.invoice_number||'',n.material_cost||0,n.other_cost||0,n.other_cost_note||'',n.work_amount==null?'':Number(n.work_amount)-Number(n.material_cost||0)-Number(n.other_cost||0)]);
  const csv=[cols,...data].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='cobros-'+financeToday()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function wireFinance(){
  if(!$('#page-cobros'))return;
  $('#financeDrilldownClose').addEventListener('click',()=>{const panel=$('#financeDrilldown');panel.hidden=true;delete panel.dataset.kind;});
  $('#financePeriod').addEventListener('change',()=>{$('#financeRangeControls').hidden=$('#financePeriod').value!=='range';renderFinance();});
  ['financeDateFrom','financeDateTo','financeStatus'].forEach(id=>$('#'+id).addEventListener('change',renderFinance));
  $('#financeSearch').addEventListener('input',renderFinance);$('#financeExport').addEventListener('click',exportFinanceReport);
}
