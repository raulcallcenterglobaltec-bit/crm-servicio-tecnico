const CFG = window.CRM_SUPABASE_CONFIG || {};
const hasBackend = !!(CFG.url && CFG.publishableKey && window.supabase?.createClient);
const db = hasBackend ? window.supabase.createClient(CFG.url, CFG.publishableKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => Number(value || 0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const categoryFor = device => /aire acondicionado|aerotermia|bomba de calor|acs|caldera|calentador|termo/i.test(String(device||'')) ? 'Clima' : (device ? 'Gama blanca' : null);
let user=null, isSuperAdmin=false, companies=[], currentCompany=null, landings=[], notices=[], tariffs=[], fields=[], members=[], realtimeChannel=null, noticeSource='landing', fieldScope='phone', noticeView='table';
let fieldEditorRows=[];
let authMode='login', selectedDate=new Date().toISOString().slice(0,10);
const defaultFields=[
  {field_key:'customer_name',label:'Nombre y apellidos',field_type:'text',required:true,visible_in_form:true,visible_in_table:true,visible_on_card:true,position:1},
  {field_key:'phone',label:'Teléfono',field_type:'phone',required:true,visible_in_form:true,visible_in_table:true,visible_on_card:true,position:2},
  {field_key:'locality',label:'Localidad',field_type:'text',required:false,visible_in_form:true,visible_in_table:false,visible_on_card:false,position:3},
  {field_key:'postal_code',label:'Código postal',field_type:'text',required:false,visible_in_form:true,visible_in_table:false,visible_on_card:false,position:4},
  {field_key:'device',label:'Aparato',field_type:'select',required:true,visible_in_form:true,visible_in_table:true,visible_on_card:true,options:['Aire acondicionado','Caldera','Calentador de gas','Termo eléctrico','Lavadora','Lavavajillas','Frigorífico','Secadora','Horno','Otro'],position:5},
  {field_key:'brand',label:'Marca del aparato',field_type:'text',required:false,visible_in_form:true,visible_in_table:false,visible_on_card:false,position:6},
  {field_key:'issue',label:'Avería o comentario',field_type:'textarea',required:false,visible_in_form:true,visible_in_table:false,visible_on_card:false,position:7}
];
function toast(message, title='Aviso') {
  const el=$('#toast'); if(!el) return;
  el.querySelector('strong').textContent=title; el.querySelector('p').textContent=message;
  el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.classList.remove('show'),5200);
}
function formDialog({title,description='',fields=[],confirmText='Guardar'}) {
  return new Promise(resolve=>{
    const backdrop=document.createElement('div');backdrop.className='modal-backdrop open';backdrop.style.zIndex='120';
    const controls=fields.map(f=>{
      const label=esc(f.label),key=esc(f.key),value=esc(f.value??''),required=f.required?'required':'';
      let control;
      if(f.type==='select')control=`<select name="${key}" ${required}>${(f.options||[]).map(o=>{const v=typeof o==='string'?o:o.value,l=typeof o==='string'?o:o.label;return `<option value="${esc(v)}" ${String(v)===String(f.value??'')?'selected':''}>${esc(l)}</option>`;}).join('')}</select>`;
      else if(f.type==='textarea')control=`<textarea name="${key}" rows="3" ${required} placeholder="${esc(f.placeholder||'')}">${value}</textarea>`;
      else if(f.type==='checkbox')control=`<input name="${key}" type="checkbox" ${f.value?'checked':''} ${required}/>`;
      else control=`<input name="${key}" type="${esc(f.type||'text')}" value="${value}" ${required} placeholder="${esc(f.placeholder||'')}" ${f.autocomplete?`autocomplete="${esc(f.autocomplete)}"`:''}/>`;
      return `<label class="field" style="margin:12px 0"><span>${label}</span>${control}</label>`;
    }).join('');
    backdrop.innerHTML=`<form class="modal" style="max-height:90vh;overflow:auto" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button class="close" type="button" data-dialog-cancel aria-label="Cerrar">×</button></div>${controls}<div class="modal-actions"><button class="outline-btn" type="button" data-dialog-cancel>Cancelar</button><button class="primary-btn" type="submit">${esc(confirmText)}</button></div></form>`;
    const finish=value=>{backdrop.remove();resolve(value);};
    backdrop.addEventListener('click',e=>{if(e.target===backdrop||e.target.closest('[data-dialog-cancel]'))finish(null);});
    $('form',backdrop).addEventListener('submit',e=>{e.preventDefault();const result={};for(const f of fields){const el=$('[name="'+CSS.escape(f.key)+'"]',backdrop);result[f.key]=f.type==='checkbox'?el.checked:f.type==='number'?Number(el.value):el.value;}finish(result);});
    document.body.append(backdrop);$('[name]',backdrop)?.focus();
  });
}
function infoDialog(title,content) {
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop open';backdrop.style.zIndex='120';
  backdrop.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${esc(title)}</h2></div><button class="close" type="button">×</button></div><pre style="white-space:pre-wrap;font:13px/1.6 inherit;color:#465268">${esc(content)}</pre><div class="modal-actions"><button class="primary-btn" type="button">Cerrar</button></div></div>`;
  document.body.append(backdrop);$$('.close, .primary-btn',backdrop).forEach(b=>b.onclick=()=>backdrop.remove());backdrop.onclick=e=>{if(e.target===backdrop)backdrop.remove();};
}
async function confirmDialog(message) {
  const answer=await formDialog({title:'Confirmar acción',description:message,fields:[],confirmText:'Confirmar'});
  return answer!==null;
}
function setConnectionError(message) {
  const box=$('#connectionError');if(!box)return;
  box.textContent=message||'';box.hidden=!message;
}
function errorText(error) { return error?.message || error?.details || String(error || 'Error desconocido'); }
function formatDate(iso) { return new Date(iso).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'}); }
function dateOnly(iso) { return new Date(iso).toLocaleDateString('en-CA'); }
function openAuth() {
  if($('#authScreen')) return;
  const style=document.createElement('style');
  style.textContent=`.auth-screen{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:linear-gradient(135deg,#eef1ff,#f8f9fc 55%,#e9f5f1);padding:18px}.auth-card{width:min(440px,100%);background:white;border:1px solid #e4e8f1;border-radius:18px;box-shadow:0 24px 70px #1a26431a;padding:30px}.auth-mark{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:white;font-size:20px;font-weight:800;background:linear-gradient(145deg,var(--accent-gradient-start),var(--accent));margin-bottom:18px}.auth-card h1{margin:0 0 7px;font-size:24px;color:#182235}.auth-card p{margin:0 0 20px;color:#788397;font-size:13px}.auth-card form{display:grid;gap:12px}.auth-card label{display:grid;gap:6px;color:#58647a;font-size:12px;font-weight:600}.auth-card input{height:42px;border:1px solid #dfe3ec;border-radius:8px;padding:0 12px;font:inherit}.auth-actions{display:flex;align-items:center;justify-content:space-between;margin-top:16px}.auth-actions button{border:0;background:none;color:var(--accent);font-weight:650;cursor:pointer}.auth-error{min-height:18px;color:#bf4257;font-size:12px;margin-top:11px}.auth-muted{font-size:11px;color:#8893a6;margin-top:14px;line-height:1.5}.auth-screen .primary-btn{height:42px;font-size:13px}.user{gap:7px}.signout-btn{border:1px solid var(--line);background:#fff;color:#657186;border-radius:8px;padding:7px 9px;font-size:11px}.company-select select{border:0;background:transparent;color:#334057;font:inherit;max-width:180px;outline:none}.integration-code{white-space:pre-wrap;word-break:break-all;background:#f5f6fa;border:1px solid #e3e7ef;border-radius:8px;padding:11px;font:11px/1.5 ui-monospace,monospace;color:#48546a}.danger-text{color:#be4357}.button-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.field-row{gap:10px}.company-select{cursor:pointer}`;
  document.head.append(style);
  const screen=document.createElement('div');screen.className='auth-screen';screen.id='authScreen';
  screen.innerHTML=`<section class="auth-card"><div class="auth-mark">S</div><h1>CRM Gestión de avisos</h1><p id="authIntro">Accede a los avisos y la configuración de tu empresa.</p><form id="authForm"><label>Correo electrónico<input id="authEmail" type="email" autocomplete="email" required placeholder="nombre@empresa.com"/></label><label>Contraseña<input id="authPassword" type="password" autocomplete="current-password" minlength="8" required placeholder="Mínimo 8 caracteres"/></label><button class="primary-btn" id="authSubmit" type="submit">Entrar</button></form><div class="auth-error" id="authError" role="status" aria-live="polite"></div><div class="auth-actions"><button id="authSwitch" type="button">Crear cuenta</button><button id="forgotPassword" type="button">He olvidado la contraseña</button></div><div class="auth-muted" id="authNote">Cada empresa y sus avisos quedan aislados por permisos de base de datos.</div></section>`;
  document.body.append(screen);
  $('#authForm').addEventListener('submit',handleAuth);
  $('#authSwitch').addEventListener('click',()=>setAuthMode(authMode==='login'?'signup':'login'));
  $('#forgotPassword').addEventListener('click',resetPassword);
  if(!hasBackend) {
    $('#authIntro').textContent='La conexión segura con la base de datos independiente está pendiente de activación.';
    $('#authError').textContent='El panel ya está publicado. Estoy preparando el proyecto de datos y el acceso.';
    $('#authSubmit').disabled=true; $('#authSwitch').hidden=true; $('#forgotPassword').hidden=true;
    $('#authNote').textContent='No introduzcas avisos reales hasta que la conexión quede activada.';
  }
}
function setAuthMode(mode) {
  authMode=mode;
  $('#authError').textContent='';
  $('#authIntro').textContent=mode==='login'?'Accede a los avisos de tu empresa.':'Crea tu acceso; el superadministrador te asignará a una empresa.';
  $('#authSubmit').textContent=mode==='login'?'Entrar':'Crear cuenta';
  $('#authSwitch').textContent=mode==='login'?'Crear cuenta':'Ya tengo cuenta';
  $('#forgotPassword').hidden=mode!=='login';
  $('#authPassword').autocomplete=mode==='login'?'current-password':'new-password';
}
async function handleAuth(event) {
  event.preventDefault(); if(!db)return;
  const email=$('#authEmail').value.trim(), password=$('#authPassword').value, message=$('#authError');
  message.textContent='Conectando…'; $('#authSubmit').disabled=true;
  try {
    if(authMode==='login') {
      const {error}=await db.auth.signInWithPassword({email,password}); if(error)throw error;
      message.textContent='Acceso correcto.';
    } else {
      localStorage.removeItem('crm-service-first-company');
      const {data,error}=await db.auth.signUp({email,password});
      if(error)throw error;
      if(data.session) {
        message.textContent='Cuenta creada. El superadministrador debe asignarte a una empresa para acceder.';
      } else {
        message.textContent='Te enviamos un correo para confirmar la cuenta. Después vuelve aquí e inicia sesión.';
      }
    }
  } catch(error) { message.textContent=errorText(error); }
  finally { $('#authSubmit').disabled=false; }
}
async function resetPassword() {
  if(!db)return;
  const email=$('#authEmail').value.trim(); if(!email){$('#authError').textContent='Escribe primero tu correo electrónico.';return;}
  const {error}=await db.auth.resetPasswordForEmail(email);
  $('#authError').textContent=error?errorText(error):'Si el correo existe, recibirás instrucciones para restablecer la contraseña.';
}
function mountSignOut() {
  const userMeta=$('.user-meta'); if(!userMeta)return;
  userMeta.querySelector('strong').textContent=user?.email||'Usuario';
  userMeta.querySelector('span').textContent=isSuperAdmin?'Superadministrador':(members.find(m=>m.user_id===user?.id)?.role==='consulta'?'Consulta':'Gestor');
  if(!$('#signOut')) { const b=document.createElement('button');b.id='signOut';b.className='signout-btn';b.textContent='Salir';$('.top-actions').append(b);b.addEventListener('click',async()=>{await db.auth.signOut();location.reload();}); }
}
async function loadMemberships() {
  const {data:globalRole,error:globalRoleError}=await db.rpc('is_super_admin');
  if(globalRoleError)throw globalRoleError;
  isSuperAdmin=globalRole===true;applyAccessPermissions();
  const {data,error}=await db.from('company_members').select('company_id,user_id,email,role').eq('user_id',user.id);
  if(error)throw error; members=data||[];
  applyAccessPermissions();
  const ids=[...new Set(members.map(m=>m.company_id))];
  if(!isSuperAdmin&&!ids.length){showOnboarding();return;}
  const companyQuery=db.from('companies').select('*').order('created_at');
  const {data:rows,error:companyError}=isSuperAdmin?await companyQuery:await companyQuery.in('id',ids);
  if(companyError)throw companyError;
  companies=rows||[];
  if(!companies.length){showOnboarding();return;}
  currentCompany=companies.find(c=>c.id===currentCompany?.id)||companies[0];
  $('#authScreen')?.remove();
  mountSignOut(); renderCompanyPicker(); renderCompanyPage(); renderMembers(); renderIntegrations(); renderSettings(); await loadCompanyData();
}
function showOnboarding() {
  localStorage.removeItem('crm-service-first-company');
  $('#authIntro').textContent='Tu cuenta todavía no está asociada a una empresa.';
  $('#authForm').hidden=true;$('#authSwitch').hidden=true;$('#forgotPassword').hidden=true;
  $('#authError').textContent='Pide al superadministrador que te invite a la empresa correspondiente.';
}
function applyAccessPermissions() {
  const adminNav=$$('[data-admin-only]');adminNav.forEach(el=>el.hidden=!isSuperAdmin);
  const picker=$('.company-select');if(picker)picker.hidden=!isSuperAdmin;
  const separator=$('.top-sep');if(separator)separator.hidden=!isSuperAdmin;
  const current=members.find(m=>m.user_id===user?.id);
  $$('[data-page]').forEach(button=>{if(['empresas','usuarios','configuracion','integraciones'].includes(button.dataset.page))button.hidden=!isSuperAdmin;});
  const createButton=$('#newNotice');if(createButton)createButton.hidden=!isSuperAdmin&&current?.role==='consulta';
  const createComplaint=$('#newComplaint');if(createComplaint)createComplaint.hidden=!isSuperAdmin&&current?.role==='consulta';
}
function mixColor(hex,target,weight) {
  const from=hex.match(/[\da-f]{2}/ig)||['52','67','e8'],to=target.match(/[\da-f]{2}/ig)||['ff','ff','ff'];
  return '#'+from.slice(0,3).map((v,i)=>Math.round(parseInt(v,16)*(1-weight)+parseInt(to[i],16)*weight).toString(16).padStart(2,'0')).join('');
}
function applyCompanyTheme(color) {
  const accent=/^#[0-9a-fA-F]{6}$/.test(color||'')?color:'#5267e8',root=document.documentElement;
  root.style.setProperty('--accent',accent);
  root.style.setProperty('--accent-soft',mixColor(accent,'#ffffff',.91));
  root.style.setProperty('--accent-border',mixColor(accent,'#ffffff',.74));
  root.style.setProperty('--accent-gradient-start',mixColor(accent,'#ffffff',.3));
  root.style.setProperty('--accent-hover',mixColor(accent,'#000000',.12));
  const rgb=accent.slice(1).match(/.{2}/g).map(x=>parseInt(x,16)).join(',');
  root.style.setProperty('--accent-shadow',`rgba(${rgb},.32)`);
}
function renderCompanyPicker() {
  const old=$('.company-select');if(!old)return;
  if(!isSuperAdmin){old.hidden=true;const separator=$('.top-sep');if(separator)separator.hidden=true;return;}
  const select=document.createElement('label');select.className='company-select';
  select.innerHTML=`<span class="company-badge">${esc((currentCompany.name||'GT').slice(0,2).toUpperCase())}</span><select id="companySwitch" aria-label="Empresa"></select>`;
  old.replaceWith(select);
  $('#companySwitch').innerHTML=companies.map(c=>`<option value="${c.id}" ${c.id===currentCompany.id?'selected':''}>${esc(c.name)}</option>`).join('');
  $('#companySwitch').addEventListener('change',async e=>{currentCompany=companies.find(c=>c.id===e.target.value);await loadCompanyData();});
  applyCompanyTheme(currentCompany.primary_color);
}
async function fetchAllNotices(companyId) {
  const all=[];let from=0;const batch=1000;
  while(true){const {data,error}=await db.from('notices').select('*').eq('company_id',companyId).order('received_at',{ascending:false}).range(from,from+batch-1);if(error)throw error;all.push(...(data||[]));if(!data||data.length<batch)break;from+=batch;}
  return {data:all,error:null};
}
async function loadCompanyData() {
  if(!currentCompany)return;
  applyCompanyTheme(currentCompany.primary_color);
  document.title=currentCompany.name+' · CRM Gestión de avisos';
  try {
    const c=currentCompany.id;
    const results=await Promise.all([
      db.from('landings').select('*').eq('company_id',c).order('name'),
      fetchAllNotices(c),
      db.from('tariffs').select('*').eq('company_id',c),
      db.from('notice_fields').select('*').eq('company_id',c).order('position'),
      db.from('company_members').select('company_id,user_id,email,role').eq('company_id',c).order('email')
    ]);
    for(const r of results)if(r.error)throw r.error;
    [landings,notices,tariffs,fields,members]=results.map(r=>r.data||[]);
    applyAccessPermissions();
    if(!fields.length){const seeds=['phone','landing'].flatMap(channel=>defaultFields.map(f=>({...f,channel,options:f.options||[],company_id:c})));const {data:createdFields,error}=await db.from('notice_fields').insert(seeds).select();if(error)throw error;fields=createdFields||[];}
    if(!realtimeChannel){realtimeChannel=db.channel('notices-'+c).on('postgres_changes',{event:'INSERT',schema:'public',table:'notices',filter:'company_id=eq.'+c},payload=>{if(payload.new?.company_id===currentCompany?.id){notices.unshift(payload.new);renderRows();}}).subscribe();}
    else {await db.removeChannel(realtimeChannel);realtimeChannel=db.channel('notices-'+c).on('postgres_changes',{event:'INSERT',schema:'public',table:'notices',filter:'company_id=eq.'+c},payload=>{if(payload.new?.company_id===currentCompany?.id){notices.unshift(payload.new);renderRows();}}).subscribe();}
    $$('.demo-banner').forEach(el=>el.remove());setConnectionError('');
    renderLandingOptions();renderRows();renderReport();renderComplaints();renderFields();renderPriceRules();renderCompanyPage();renderMembers();renderIntegrations();renderSettings();
    mountSignOut();
  } catch(error) {
    landings=[];notices=[];tariffs=[];fields=[];
    $$('.demo-banner').forEach(el=>el.remove());
    renderLandingOptions();renderRows();renderReport();renderComplaints();renderFields();renderPriceRules();renderCompanyPage();renderMembers();renderIntegrations();renderSettings();
    const message='No se pudieron cargar los datos de esta empresa: '+errorText(error);
    setConnectionError(message);toast(message,'Error de conexión');
  }
}
function landingName(id) { return landings.find(l=>l.id===id)?.name||'Entrada manual'; }
function landingOptions(selected='') { return '<option value="">Sin landing</option>'+landings.filter(l=>l.is_active).map(l=>`<option value="${l.id}" ${selected===l.id?'selected':''}>${esc(l.name)}</option>`).join(''); }
function renderLandingOptions() {
  const filters=$('#landingFilter');if(filters)filters.innerHTML='<option value="all">Todas las landings</option>'+landings.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
  const reportFilter=$('#reportLanding');if(reportFilter){const selected=reportFilter.value||'all';reportFilter.innerHTML='<option value="all">Todas las landings</option>'+landings.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');reportFilter.value=selected;}
  const landingChoices='<option value="">Todas las landings</option>'+landings.filter(l=>l.is_active).map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
  const fieldLanding=$('#newFieldLanding');if(fieldLanding){const chosen=fieldLanding.value;fieldLanding.innerHTML=landingChoices;fieldLanding.value=chosen;}
  const fieldFilter=$('#fieldLandingFilter');if(fieldFilter){const chosen=fieldFilter.value;fieldFilter.innerHTML='<option value="">Campos generales (todas las landings)</option>'+landings.filter(l=>l.is_active).map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');fieldFilter.value=chosen;}
}
function statusLabel(s) { return s==='Sale'?'Aviso Sacado':s==='No sale'?'Aviso Nulo':s==='Nuevo'?'Nuevo':'—'; }
function statusClass(s) { return s==='Sale'?'sold':s==='No sale'?'lost':'new'; }
function getUnitPrice(n) {
  if(n.status==='Sale')return Number(n.unit_price||0);
  const t=tariffs.find(x=>x.landing_id===n.landing_id&&x.category===n.category);return 0;
}
function inDatePeriod(date, period, exact, from, to) {
  const today=dateOnly(new Date().toISOString());
  if(period==='today')return date===today;
  if(period==='yesterday'){const d=new Date(today+'T12:00:00');d.setDate(d.getDate()-1);return date===dateOnly(d.toISOString());}
  if(period==='date')return !exact||date===exact;
  if(period==='range')return (!from||date>=from)&&(!to||date<=to);
  if(period==='week'){const d=new Date(today+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return date>=dateOnly(d.toISOString())&&date<=today;}
  if(period==='month')return date.slice(0,7)===today.slice(0,7);
  const cutoff=new Date(today+'T12:00:00');cutoff.setDate(cutoff.getDate()-29);return date>=cutoff.toISOString().slice(0,10)&&date<=today;
}
function filteredNotices(report=false) {
  const period=$('#'+(report?'reportPeriod':'period')).value;
  const exact=$('#'+(report?'reportExactDate':'exactDate')).value;
  const from=$('#'+(report?'reportDateFrom':'dateFrom')).value;
  const to=$('#'+(report?'reportDateTo':'dateTo')).value;
  const weekday=$('#'+(report?'reportWeekday':'weekdayFilter'))?.value||'all';
  const status=$('#'+(report?'reportStatus':'statusFilter'))?.value||'all';
  const landing=$('#'+(report?'reportLanding':'landingFilter'))?.value||'all';
  const query=(report?'':($('#tableSearch').value||$('#globalSearch').value)).toLowerCase();
  return notices.filter(n=>{
    const sourceMatch=n.notice_type==='aviso'&&(report||((n.created_by?'phone':'landing')===noticeSource));
    const d=dateOnly(n.received_at), day=new Date(d+'T12:00:00').getDay();
    const allText=[n.customer_name,n.phone,n.email,n.device,n.brand,n.issue,n.locality,landingName(n.landing_id),JSON.stringify(n.custom_fields||{})].join(' ').toLowerCase();
    return sourceMatch&&inDatePeriod(d,period,exact,from,to)&&(weekday==='all'||day===Number(weekday))&&(status==='all'||n.status===status)&&(landing==='all'||n.landing_id===landing)&&(!query||allText.includes(query));
  });
}
function noticeFieldsForCards() {
  const landingFilter=$('#landingFilter')?.value||'all';
  const sourceFields=noticeSource==='phone'?fieldsForPhone():(landingFilter==='all'?fields.filter(f=>f.channel==='landing'):fieldsForLanding(landingFilter));
  const byKey=new Map();for(const f of sourceFields)if(!byKey.has(f.field_key)||f.landing_id===landingFilter)byKey.set(f.field_key,f);
  return [...byKey.values()].sort((a,b)=>a.position-b.position);
}
function selectedCardFields() {
  return noticeFieldsForCards().filter(f=>f.visible_on_card!==false&&f.field_key!=='customer_name').map(f=>f.field_key);
}
function canManageCurrentNotices() {
  return isSuperAdmin||members.some(m=>m.user_id===user?.id&&m.role==='gestor');
}
function updateLandingBadge() {
  const count=notices.filter(n=>n.landing_id&&n.status==='Nuevo').length;
  const badge=$('#landingPendingBadge');if(badge){badge.textContent=count>99?'99+':String(count);badge.hidden=count===0;}
  const button=$('#pendingLandingButton');if(button){button.hidden=noticeSource!=='landing'||count===0;button.textContent=`⚑ Avisos pendientes (${count})`;}
}
function renderCardFieldPanel() {
  const panel=$('#cardFieldPanel');if(!panel)return;
  const toggle=$('#cardFieldsToggle');if(toggle)toggle.hidden=!isSuperAdmin;
  if(!isSuperAdmin){panel.hidden=true;return;}
  const chosen=selectedCardFields();
  panel.innerHTML='<span style="grid-column:1/-1;font-size:10px;color:#8993a4">Nombre, origen y fecha se muestran siempre.</span>'+noticeFieldsForCards().filter(f=>f.field_key!=='customer_name').map(f=>`<label><input type="checkbox" data-card-field="${esc(f.id)}" ${chosen.includes(f.field_key)?'checked':''}/> ${esc(f.label)}</label>`).join('');
  $$('[data-card-field]',panel).forEach(input=>input.addEventListener('change',async event=>{
    const field=fields.find(f=>f.id===event.target.dataset.cardField);if(!field)return;
    const {data,error}=await db.from('notice_fields').update({visible_on_card:event.target.checked}).eq('id',field.id).select().single();
    if(error){toast(errorText(error),'No se pudo guardar');renderCardFieldPanel();return;}
    Object.assign(field,data);renderRows();
  }));
}
function setNoticeView(view) {
  noticeView=view==='cards'?'cards':'table';
  if(currentCompany)localStorage.setItem(`crm-service-notice-view:${currentCompany.id}:${noticeSource}`,noticeView);
  $('#noticeTableView').hidden=noticeView!=='table';$('#kanbanBoard').hidden=noticeView!=='cards';
  $$('[data-notice-view]').forEach(button=>button.classList.toggle('active',button.dataset.noticeView===noticeView));
  renderKanban(filteredNotices(false));
}
function renderKanban(rows) {
  const board=$('#kanbanBoard');if(!board)return;
  const labels={Nuevo:'Avisos nuevos',Sale:'Aviso Sacado', 'No sale':'Aviso Nulo'};
  const chosen=selectedCardFields(),available=noticeFieldsForCards().filter(f=>chosen.includes(f.field_key)&&f.field_key!=='customer_name');
  board.innerHTML=['Nuevo','Sale','No sale'].map(status=>{
    const cards=rows.filter(n=>(n.status||'Nuevo')===status).map(n=>{
      const customer=n.customer_name||'Sin nombre';
      const details=available.map(f=>{
        const value=n.custom_fields?.[f.field_key]??n[f.field_key]??'';
        return value!==''&&value!==null&&value!==undefined?`<span><b>${esc(f.label)}:</b> ${esc(value)}</span>`:'';
      }).filter(Boolean).join('');
      const origin=n.created_by?'Teléfono':landingName(n.landing_id);
      return `<article class="notice-card" draggable="${canManageCurrentNotices()}" data-card-id="${esc(n.id)}"><div class="notice-card-head"><div><strong>${esc(customer)}</strong></div><button type="button" class="row-action" data-open-card="${esc(n.id)}" aria-label="Ver aviso">···</button></div><div class="notice-card-fields">${details}<span><b>Origen:</b> ${esc(origin)}</span><span><b>Recibido:</b> ${esc(formatDate(n.received_at))}</span></div><div class="notice-card-foot"><select data-card-status="${esc(n.id)}" aria-label="Cambiar estado del aviso" ${canManageCurrentNotices()?'':'disabled'}>${['Nuevo','Sale','No sale'].map(s=>`<option value="${s}" ${s===status?'selected':''}>${esc(statusLabel(s))}</option>`).join('')}</select>${status==='Sale'&&!n.created_by?`<small>${money(getUnitPrice(n))}</small>`:''}</div></article>`;
    }).join('');
    return `<section class="kanban-column" data-drop-status="${status}"><div class="kanban-column-head"><span>${labels[status]}</span><span class="kanban-count">${rows.filter(n=>(n.status||'Nuevo')===status).length}</span></div><div class="kanban-list">${cards||'<div class="empty" style="padding:22px 8px;font-size:10px">Arrastra un aviso aquí</div>'}</div></section>`;
  }).join('');
  $$('[data-card-id]',board).forEach(card=>{
    card.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',card.dataset.cardId);event.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
  });
  $$('.kanban-column',board).forEach(column=>{
    column.addEventListener('dragover',event=>{event.preventDefault();column.classList.add('drag-over');});
    column.addEventListener('dragleave',event=>{if(!column.contains(event.relatedTarget))column.classList.remove('drag-over');});
    column.addEventListener('drop',async event=>{event.preventDefault();column.classList.remove('drag-over');const id=event.dataTransfer.getData('text/plain');if(id)await changeStatus(id,column.dataset.dropStatus);});
  });
  $$('[data-card-status]',board).forEach(select=>select.addEventListener('change',event=>changeStatus(event.target.dataset.cardStatus,event.target.value)));
  $$('[data-open-card]',board).forEach(button=>button.addEventListener('click',()=>showDetails(button.dataset.openCard)));
}
function renderRows() {
  const body=$('#noticeRows');if(!body)return;
  const rows=filteredNotices(false);
  const landingFilter=$('#landingFilter')?.value||'all';
  const canManage=canManageCurrentNotices();
  const shownFields=(noticeSource==='phone'?fieldsForPhone():(landingFilter==='all'?fields.filter(f=>f.channel==='landing'):fieldsForLanding(landingFilter))).filter(f=>f.visible_in_table);
  const sourceHeading=noticeSource==='phone'?'ORIGEN':'LANDING DE ORIGEN';
  const systemHead=`<th>${sourceHeading}</th><th>RECIBIDO</th><th>ESTADO</th><th>VALOR</th><th></th>`;
  const th=$('thead tr',body.closest('table'));if(th)th.innerHTML=shownFields.map(f=>`<th>${esc(f.label.toUpperCase())}</th>`).join('')+systemHead;
  body.innerHTML=rows.map(n=>{
    const cells=shownFields.map(f=>{
      let v=n.custom_fields?.[f.field_key]??n[f.field_key]??'';
      if(f.field_key==='customer_name')return `<td><div class="client-cell"><span class="client-initial">${esc((v||'??').slice(0,2).toUpperCase())}</span><div><strong>${esc(v||'Sin nombre')}</strong><small>${esc(n.phone||'')}</small></div></div></td>`;
      if(f.field_key==='device')return `<td><span class="device">${esc(v||'—')}</span></td>`;
      if(f.field_key==='phone')return `<td>${esc(v||'—')}</td>`;
      return `<td>${esc(v||'—')}</td>`;
    }).join('');
    const sourceLabel=n.created_by?'Teléfono':landingName(n.landing_id);
    return `<tr>${cells}<td><span class="source">${esc(sourceLabel)}</span></td><td>${esc(formatDate(n.received_at))}</td><td><select class="status ${statusClass(n.status)}" data-status-id="${n.id}" aria-label="Cambiar estado" ${canManage?'':'disabled'}>${['Nuevo','Sale','No sale'].map(s=>`<option value="${esc(s)}" ${s===n.status?'selected':''}>${esc(statusLabel(s))}</option>`).join('')}</select></td><td>${n.status==='Sale'&&!n.created_by?money(getUnitPrice(n)):'—'}</td><td><button class="row-action" data-open-id="${n.id}" aria-label="Abrir aviso">···</button></td></tr>`;
  }).join('');
  $('#emptyState').hidden=rows.length>0;
  const sourceTotal=notices.filter(n=>n.notice_type==='aviso'&&(noticeSource==='phone'?!!n.created_by:!!n.landing_id)).length;
  $('#rowCount').textContent=`Mostrando ${rows.length} de ${sourceTotal} avisos`;
  renderCardFieldPanel();renderKanban(rows);
  const fresh=rows.filter(n=>n.status==='Nuevo').length,sold=rows.filter(n=>n.status==='Sale').length,lost=rows.filter(n=>n.status==='No sale').length,total=rows.length,managed=sold+lost;
  $('#mTotal').textContent=total;$('#mNew').textContent=fresh;$('#mSold').textContent=sold;$('#mLost').textContent=lost;
  $('#mConversion').textContent=`${managed?Math.round(sold/managed*100):0} %`;$('#mLostPercent').textContent=`${total?Math.round(lost/total*100):0} % de avisos recibidos`;
  $('#donutTotal').textContent=total;$('#donutSold').textContent=sold;$('#donutLost').textContent=lost;$('#donutNew').textContent=fresh;
  const soldPct=total?sold/total*100:0,lostPct=total?lost/total*100:0;
  $('.donut').style.background=`conic-gradient(var(--accent) 0 ${soldPct}%,#efbb65 ${soldPct}% ${soldPct+lostPct}%,#dfe3eb ${soldPct+lostPct}% 100%)`;
  const days=[1,2,3,4,5,6,0].map(day=>{const g=rows.filter(n=>new Date(dateOnly(n.received_at)+'T12:00:00').getDay()===day);return[g.length,g.filter(n=>n.status==='Sale').length,g.filter(n=>n.status==='No sale').length];});
  const max=Math.max(1,...days.flat());
  $$('.bar-group').forEach((g,i)=>$$('.bar',g).forEach((b,j)=>b.style.height=`${days[i]?.[j]/max*100||0}%`));
  updateLandingBadge();
  $$('[data-status-id]',body).forEach(sel=>sel.addEventListener('change',async e=>changeStatus(e.target.dataset.statusId,e.target.value)));
  $$('[data-open-id]',body).forEach(b=>b.addEventListener('click',()=>showDetails(b.dataset.openId)));
  renderReport();
}
function renderComplaints() {
  const body=$('#complaintRows');if(!body)return;
  const rows=notices.filter(n=>n.notice_type==='reclamacion'||n.notice_type==='anulacion').sort((a,b)=>new Date(b.received_at)-new Date(a.received_at));
  $('#complaintCount').textContent=`${rows.length} ${rows.length===1?'registro':'registros'}`;
  $('#complaintEmpty').hidden=rows.length>0;
  body.innerHTML=rows.map(n=>`<tr><td>${esc(formatDate(n.received_at))}</td><td><div class="client-cell"><span class="client-initial">${esc((n.customer_name||'??').slice(0,2).toUpperCase())}</span><div><strong>${esc(n.customer_name||'Sin nombre')}</strong><small>${esc(n.locality||'')}</small></div></div></td><td>${esc(n.phone||'—')}</td><td><span class="source">${n.notice_type==='anulacion'?'Anulación':'Reclamación'}</span></td><td class="complaint-detail">${esc(n.issue||'—')}</td><td><button class="row-action" data-complaint-detail="${esc(n.id)}" aria-label="Ver datos">···</button></td></tr>`).join('');
  $$('[data-complaint-detail]',body).forEach(button=>button.onclick=()=>showDetails(button.dataset.complaintDetail));
}
async function changeStatus(id,status) {
  if(!canManageCurrentNotices())return;
  const n=notices.find(x=>x.id===id);if(!n)return;
  const wasSale=n.status==='Sale';
  const tariff=tariffs.find(t=>t.landing_id===n.landing_id&&t.category===n.category);
  const patch={status,managed_at:status==='Nuevo'?null:new Date().toISOString(),unit_price:status==='Sale'?Number(tariff?.price||0):0};
  const {data,error}=await db.from('notices').update(patch).eq('id',id).select().single();
  if(error){toast(errorText(error),'No se pudo guardar');renderRows();return;}
  Object.assign(n,data);renderRows();
  if(!wasSale&&status==='Sale'&&n.created_by&&!n.landing_id&&n.notice_type==='aviso')await sendNoticeToConfiguredIntegrations(n);
}
async function sendNoticeToConfiguredIntegrations(notice) {
  const {data,error}=await db.functions.invoke('notify-notice',{body:{notice_id:notice.id}});
  if(error){toast(errorText(error),'Aviso guardado, pero no se pudo enviar');return false;}
  const results=data?.results||[],sent=results.filter(result=>result.ok).map(result=>({telegram:'Telegram',email:'correo',whatsapp:'WhatsApp'}[result.kind]||result.kind)),failed=results.filter(result=>!result.ok);
  if(!results.length){toast('No hay canales seleccionados para este tipo de registro.','Guardado en el CRM');return false;}
  if(failed.length){const names=failed.map(result=>({telegram:'Telegram',email:'correo',whatsapp:'WhatsApp'}[result.kind]||result.kind)).join(', ');toast(sent.length?`Enviado a ${sent.join(', ')}. Falló: ${names}.`:`No se pudo enviar a ${names}.`,'Aviso guardado con incidencias');return false;}
  const label=notice.notice_type==='anulacion'?'Anulación enviada':notice.notice_type==='reclamacion'?'Reclamación enviada':'Aviso telefónico enviado';
  toast(`${notice.customer_name||'Cliente'} · ${sent.join(', ')}`,label);return true;
}
function showDetails(id) {
  const n=notices.find(x=>x.id===id);if(!n)return;
  const custom=Object.entries(n.custom_fields||{}).map(([k,v])=>`${fields.find(f=>f.field_key===k)?.label||k}: ${v}`).join('\n');
  const sourceLabel=n.created_by?'Teléfono':landingName(n.landing_id);
  const typeLabel=n.notice_type==='anulacion'?'Anulación':n.notice_type==='reclamacion'?'Reclamación':'Aviso técnico';
  infoDialog('Detalle del registro',`Tipo: ${typeLabel}\nCliente: ${n.customer_name}\nTeléfono: ${n.phone}\nCorreo: ${n.email||'—'}\nAparato: ${n.device||'—'}\nOrigen: ${sourceLabel}\nEstado: ${statusLabel(n.status)}\nRecibido: ${formatDate(n.received_at)}\nLocalidad: ${n.locality||'—'}\nCódigo postal: ${n.postal_code||'—'}\nMarca: ${n.brand||'—'}\nDetalle: ${n.issue||'—'}\n${custom}`);
}
function setupDate(prefix) {
  const report=prefix==='report', select=$('#'+(report?'reportPeriod':'period'));
  const exact=$('#'+(report?'reportExactDateControl':'exactDateControl')), range=$('#'+(report?'reportRangeControls':'rangeDateControls'));
  select.addEventListener('change',()=>{exact.hidden=select.value!=='date';range.hidden=select.value!=='range';report?renderReport():renderRows();});
  (report?['reportExactDate','reportDateFrom','reportDateTo']:['exactDate','dateFrom','dateTo']).forEach(id=>$('#'+id).addEventListener('change',()=>report?renderReport():renderRows()));
}
function getReportRows(){return filteredNotices(true);}
function renderReport() {
  const rows=getReportRows(),sold=rows.filter(n=>n.status==='Sale'),lost=rows.filter(n=>n.status==='No sale'),managed=sold.length+lost.length;
  const revenue=sold.reduce((a,n)=>a+Number(n.unit_price||0),0);
  const groups=landings.map(l=>{const g=rows.filter(n=>n.landing_id===l.id);return{landing:l,total:g.length,sold:g.filter(n=>n.status==='Sale').length,lost:g.filter(n=>n.status==='No sale').length};});
  const best=[...groups].sort((a,b)=>b.sold-a.sold||b.total-a.total)[0];
  $('#reportConversion').textContent=`${managed?Math.round(sold.length/managed*100):0} %`;
  $('#reportManagedCount').textContent=`${managed} avisos gestionados`;
  $('#reportRevenue').textContent=money(revenue);$('#reportTotal').textContent=rows.length;
  $('#reportBestLanding').textContent=best?.total?best.landing.name:'—';$('#reportBestDetail').textContent=best?.total?`${best.total} avisos · ${best.sold} Avisos Sacados`:'0 avisos sacados';
  $('#reportLandingResults').innerHTML=groups.map(g=>`<div class="placeholder-tile"><strong>${esc(g.landing.name)}</strong><small>${g.total} avisos · ${g.sold} Avisos Sacados · ${g.lost} Avisos Nulos</small></div>`).join('')||'<div class="empty">Añade una landing para empezar.</div>';
  const totals=new Map();sold.forEach(n=>{const k=`${landingName(n.landing_id)} · ${n.category||'Sin categoría'}`,v=totals.get(k)||{amount:0,count:0};v.amount+=Number(n.unit_price||0);v.count++;totals.set(k,v);});
  $('#reportPriceRows').innerHTML=[...totals].sort((a,b)=>b[1].amount-a[1].amount).map(([label,v])=>`<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f0f1f5;padding:8px 0;font-size:11px"><span>${esc(label)} <small>(${v.count})</small></span><strong>${money(v.amount)}</strong></div>`).join('')||'<div class="empty">No hay avisos sacados en este filtro.</div>';
}
function renderPriceRules() {
  const body=$('#priceRows');if(!body)return;
  body.innerHTML=tariffs.map((t,i)=>`<tr><td><select data-tariff-landing="${i}">${landings.map(l=>`<option value="${l.id}" ${l.id===t.landing_id?'selected':''}>${esc(l.name)}</option>`).join('')}</select></td><td><select data-tariff-category="${i}">${['Gama blanca','Clima'].map(c=>`<option ${c===t.category?'selected':''}>${c}</option>`).join('')}</select></td><td><input type="number" min="0" step="0.01" value="${t.price}" data-tariff-price="${i}"/></td><td><button class="mini-delete" data-tariff-delete="${i}" aria-label="Eliminar tarifa">×</button></td></tr>`).join('');
  $$('[data-tariff-landing]').forEach(x=>x.addEventListener('change',e=>updateTariff(+e.target.dataset.tariffLanding,{landing_id:e.target.value})));
  $$('[data-tariff-category]').forEach(x=>x.addEventListener('change',e=>updateTariff(+e.target.dataset.tariffCategory,{category:e.target.value})));
  $$('[data-tariff-price]').forEach(x=>x.addEventListener('change',e=>updateTariff(+e.target.dataset.tariffPrice,{price:Number(e.target.value||0)})));
  $$('[data-tariff-delete]').forEach(x=>x.addEventListener('click',async e=>{const t=tariffs[+e.target.dataset.tariffDelete];if(!await confirmDialog('¿Eliminar esta tarifa?'))return;const {error}=await db.from('tariffs').delete().eq('id',t.id);if(error)toast(errorText(error),'Error');else{tariffs=tariffs.filter(x=>x.id!==t.id);renderPriceRules();renderRows();}}));
}
async function updateTariff(i,changes) {
  const t=tariffs[i];const merged={...t,...changes,company_id:currentCompany.id,updated_at:new Date().toISOString()};
  const duplicate=tariffs.find((other,index)=>index!==i&&other.landing_id===merged.landing_id&&other.category===merged.category);
  if(duplicate){toast('Ya existe una tarifa para esa landing y categoría.','Tarifa duplicada');renderPriceRules();return;}
  const {data,error}=await db.from('tariffs').update(merged).eq('id',t.id).select().single();
  if(error){toast(errorText(error),'Tarifa no guardada');return;}
  tariffs[i]=data;renderRows();renderReport();
}
async function renderFields() {
  const list=$('#fieldList');if(!list)return;
  const selectedLanding=fieldScope==='landing'?($('#fieldLandingFilter')?.value||''):null;
  fieldEditorRows=fields.filter(f=>f.channel===fieldScope&&(fieldScope==='phone'?!f.landing_id:(selectedLanding?f.landing_id===selectedLanding:!f.landing_id)));
  const title=$('#fieldEditorTitle');if(title)title.textContent=fieldScope==='phone'?'Campos de aviso por teléfono':'Campos de aviso por landing';
  const description=$('#fieldEditorDescription');if(description)description.textContent=fieldScope==='phone'?'Configura los datos de los avisos que se reciben por teléfono.':'Los campos generales se aplican a todas las landing. Selecciona una landing para configurar sus campos específicos.';
  const landingWrap=$('#landingFieldControls');if(landingWrap)landingWrap.hidden=fieldScope==='phone';
  const typeNames={text:'Texto',phone:'Teléfono',email:'Correo',number:'Número',date:'Fecha',select:'Lista',textarea:'Texto largo',checkbox:'Casilla'};
  list.innerHTML=fieldEditorRows.map((f,i)=>`<div class="field-row" style="grid-template-columns:minmax(125px,1fr) 100px auto auto auto auto auto auto;gap:6px"><input data-field-label="${i}" aria-label="Nombre del campo" value="${esc(f.label)}"/><select data-field-type="${i}" aria-label="Tipo de campo">${Object.entries(typeNames).map(([key,label])=>`<option value="${key}" ${f.field_type===key?'selected':''}>${label}</option>`).join('')}</select><label><input type="checkbox" data-field-required="${i}" ${f.required?'checked':''}/> Obligatorio</label><label><input type="checkbox" data-field-table="${i}" ${f.visible_in_table?'checked':''}/> Columna</label><label><input type="checkbox" data-field-card-config="${i}" ${f.visible_on_card?'checked':''} ${f.field_key==='customer_name'?'disabled':''}/> Tarjeta</label><label><input type="checkbox" data-field-form="${i}" ${f.visible_in_form?'checked':''}/> Formulario</label><small>${f.landing_id?esc(landingName(f.landing_id)):'Todas'}</small><button class="mini-delete" data-field-delete="${i}" aria-label="Eliminar campo">×</button></div>`).join('')||'<div class="empty">No hay campos exclusivos en esta selección. Los campos generales se mantienen si has seleccionado una landing.</div>';
  $$('[data-field-label]').forEach(x=>x.addEventListener('change',async e=>{const i=+e.target.dataset.fieldLabel,label=e.target.value.trim();if(!label){e.target.value=fieldEditorRows[i].label;return;}await saveField(i,{label});}));
  $$('[data-field-type]').forEach(x=>x.addEventListener('change',async e=>{const i=+e.target.dataset.fieldType,field_type=e.target.value;let options=fieldEditorRows[i].options||[];if(field_type==='select'){const answer=await formDialog({title:'Opciones del campo',description:'Escribe las opciones separadas por comas.',fields:[{key:'options',label:'Opciones',type:'text',value:options.join(', '),required:true}]});if(!answer){renderFields();return;}options=answer.options.split(',').map(v=>v.trim()).filter(Boolean);}await saveField(i,{field_type,options});}));
  $$('[data-field-required]').forEach(x=>x.addEventListener('change',e=>saveField(+e.target.dataset.fieldRequired,{required:e.target.checked})));
  $$('[data-field-table]').forEach(x=>x.addEventListener('change',e=>saveField(+e.target.dataset.fieldTable,{visible_in_table:e.target.checked})));
  $$('[data-field-card-config]').forEach(x=>x.addEventListener('change',e=>saveField(+e.target.dataset.fieldCardConfig,{visible_on_card:e.target.checked})));
  $$('[data-field-form]').forEach(x=>x.addEventListener('change',e=>saveField(+e.target.dataset.fieldForm,{visible_in_form:e.target.checked})));
  $$('[data-field-delete]').forEach(x=>x.addEventListener('click',async e=>{const f=fieldEditorRows[+e.target.dataset.fieldDelete];if(!await confirmDialog(`¿Eliminar el campo «${f.label}» de futuras entradas?`))return;const {error}=await db.from('notice_fields').delete().eq('id',f.id);if(error)toast(errorText(error),'Error');else{fields=fields.filter(x=>x.id!==f.id);renderFields();renderRows();renderExtraFields();}}));
}
async function saveField(i,changes) {
  const f=fieldEditorRows[i];const {data,error}=await db.from('notice_fields').update(changes).eq('id',f.id).select().single();
  if(error){toast(errorText(error),'Campo no guardado');renderFields();return;}Object.assign(f,data);renderFields();renderRows();renderExtraFields();
}
function fieldsForLanding(landingId) {
  const applicable=fields.filter(f=>f.channel==='landing'&&(!f.landing_id||f.landing_id===landingId));
  const byKey=new Map();for(const f of applicable){const current=byKey.get(f.field_key);if(!current||f.landing_id===landingId)byKey.set(f.field_key,f);}
  return [...byKey.values()].sort((a,b)=>a.position-b.position);
}
function fieldsForPhone() { return fields.filter(f=>f.channel==='phone'&&!f.landing_id).sort((a,b)=>a.position-b.position); }
function renderExtraFields() {
  syncDefaultFields();
  const host=$('#extraNoticeFields');if(!host)return;
  host.innerHTML=fieldsForPhone().filter(f=>f.visible_in_form&&!['customer_name','phone','locality','postal_code','device','brand','issue'].includes(f.field_key)).map(f=>{
    const inputType={text:'text',phone:'tel',email:'email',number:'number',date:'date',select:'select',textarea:'textarea',checkbox:'checkbox'}[f.field_type]||'text';
    let field=inputType==='select'?'<select '+(f.required?'required':'')+'>'+['',...(f.options||[])].map(v=>`<option>${esc(v)}</option>`).join('')+'</select>':inputType==='textarea'?'<textarea '+(f.required?'required':'')+'></textarea>':`<input type="${inputType}" ${f.required?'required':''} ${inputType==='checkbox'?'value="true"':''}/>`;
    return `<label class="field custom-field-value" data-custom-key="${esc(f.field_key)}"><span>${esc(f.label)}</span>${field}</label>`;
  }).join('');
}
function syncDefaultFields() {
  const map={name:'customer_name',phone:'phone',locality:'locality',postal:'postal_code',device:'device',brand:'brand',issue:'issue'};
  $$('[data-field-code]').forEach(el=>{
    const code=map[el.dataset.fieldCode]||el.dataset.fieldCode;
    const sourceFields=noticeSource==='phone'?fieldsForPhone():fieldsForLanding($('#fLanding')?.value||null);
    const field=sourceFields.find(f=>f.field_key===code);
    el.hidden=!!field&&!field.visible_in_form;
    if(field){const label=$('label',el);if(label)label.textContent=field.label;const control=$('input,select,textarea',el);if(control){control.required=field.required;if(field.field_type==='phone'&&control.tagName==='INPUT')control.type='tel';if(field.field_type==='email'&&control.tagName==='INPUT')control.type='email';if(field.field_type==='number'&&control.tagName==='INPUT')control.type='number';if(code==='device'&&control.tagName==='SELECT'&&field.options?.length)control.innerHTML=field.options.map(v=>`<option>${esc(v)}</option>`).join('');}}
  });
}
function updateRecordFormMode() {
  const type=$('#fRecordType')?.value||'aviso',nonNotice=type!=='aviso';
  $('#recordTypeWrap').hidden=noticeSource!=='phone';
  $('#statusFieldWrap').hidden=nonNotice;
  const deviceField=$('[data-field-code="device"]'),brandField=$('[data-field-code="brand"]'),issueField=$('[data-field-code="issue"]');
  if(deviceField&&nonNotice)deviceField.hidden=true;
  if(brandField&&nonNotice)brandField.hidden=true;
  if(issueField&&nonNotice)issueField.hidden=false;
  const issueLabel=$('#fIssueLabel'),issue=$('#fIssue');
  if(issueLabel)issueLabel.textContent=type==='anulacion'?'Detalle de la anulación':type==='reclamacion'?'Motivo de la reclamación':'Avería o comentario';
  if(issue) {issue.placeholder=nonNotice?(type==='anulacion'?'Describe qué servicio, cita o solicitud se quiere anular':'Describe exactamente qué reclama el cliente'):'Describe brevemente el problema';issue.required=nonNotice;}
  $('#modalTitle').textContent=type==='anulacion'?'Registrar anulación':type==='reclamacion'?'Registrar reclamación':'Añadir aviso';
  $('#modalDescription').textContent=nonNotice?'Completa los datos de la persona y el detalle de la reclamación o anulación.':'Completa los datos para registrar un aviso telefónico.';
  const submit=$('#noticeForm button[type="submit"]');if(submit)submit.textContent=type==='anulacion'?'Guardar anulación':type==='reclamacion'?'Guardar reclamación':'Guardar aviso';
}
function openPhoneNotice(type='aviso') {
  noticeSource='phone';$('#noticeForm').reset();$('#fRecordType').value=type;
  syncDefaultFields();renderExtraFields();updateRecordFormMode();
  $('#modal').classList.add('open');$('#fName').focus();
}
async function createNotice(event) {
  event.preventDefault();
  const submitButtons=$$('#noticeForm button[type="submit"]');
  submitButtons.forEach(button=>button.disabled=true);
  const v=id=>$('#'+id).value.trim();
  const type=$('#fRecordType').value||'aviso',isPhoneNotice=type==='aviso',device=isPhoneNotice?v('fDevice'):'';const custom_fields={};
  $$('[data-custom-key]', $('#noticeForm')).forEach(el=>{const c=$('input,select,textarea',el);custom_fields[el.dataset.customKey]=c.type==='checkbox'?c.checked:c.value;});
  const category=categoryFor(device);
  const row={company_id:currentCompany.id,landing_id:null,notice_type:type,status:isPhoneNotice?(v('fStatus')||'Nuevo'):'Nuevo',customer_name:v('fName'),phone:v('fPhone'),email:$('#fEmail')?.value?.trim()||null,locality:v('fLocality')||null,postal_code:v('fPostal')||null,device:device||null,category:isPhoneNotice?category:null,brand:isPhoneNotice?(v('fBrand')||null):null,issue:v('fIssue')||null,custom_fields,unit_price:0,created_by:user.id};
  const {data,error}=await db.from('notices').insert(row).select().single();
  if(error){submitButtons.forEach(button=>button.disabled=false);toast(errorText(error),'No se pudo guardar el aviso');return;}
  submitButtons.forEach(button=>button.disabled=false);
  notices.unshift(data);$('#modal').classList.remove('open');event.target.reset();renderRows();renderComplaints();
  if(type!=='aviso')await sendNoticeToConfiguredIntegrations(data);
  else if(data.status==='Sale')await sendNoticeToConfiguredIntegrations(data);
  else toast(`Teléfono · ${data.device||'Aviso'} · ${formatDate(data.received_at)}`,'Aviso guardado en el CRM');
}
function showSettingsTab(name) {
  $$('[data-settings-tab]').forEach(button=>button.classList.toggle('active',button.dataset.settingsTab===name));
  const panelName=(name==='phone-fields'||name==='landing-fields')?'fields':name;
  $$('[data-settings-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.settingsPanel===panelName));
  if(name==='phone-fields'){fieldScope='phone';renderFields();}
  if(name==='landing-fields'){fieldScope='landing';renderFields();}
}
async function renderSettings() {
  if(!isSuperAdmin)return;
  if(!currentCompany)return;
  const article=$('#brandPanel');
  if(article) {
    const input=$('input[value="Global Técnicos"]',article)||$('input',article); if(input)input.value=currentCompany.name;
    const color=$('input[type=color]',article);if(color){color.value=currentCompany.primary_color||'#5267e8';color.oninput=()=>applyCompanyTheme(color.value);}
    if(currentCompany.logo_path&&$('.company-logo',article)==null){const img=document.createElement('img');img.src=currentCompany.logo_path;img.className='company-logo';img.style='max-width:140px;max-height:60px;display:block;margin:10px 0';article.append(img);}
    let file=$('#logoFile',article),button=$('#uploadLogo',article);
    if(!file){file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp,image/svg+xml';file.id='logoFile';file.style='position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none';file.setAttribute('aria-label','Seleccionar archivo de logo');article.append(file);}
    if(!button){button=document.createElement('button');button.id='uploadLogo';button.className='outline-btn';button.textContent='Subir logo';article.append(button);}
    button.onclick=()=>file.click();file.onchange=uploadLogo;
  }
  renderFields();renderPriceRules();
}
async function saveCompanySettings() {
  const article=$('#brandPanel');
  const color=$('input[type=color]',article)?.value||'#5267e8';
  const name=$('input',article)?.value?.trim()||currentCompany.name;
  const {data,error}=await db.from('companies').update({name,primary_color:color}).eq('id',currentCompany.id).select().single();
  if(error){applyCompanyTheme(currentCompany.primary_color);const colorInput=$('input[type=color]',article);if(colorInput)colorInput.value=currentCompany.primary_color||'#5267e8';toast(errorText(error),'Configuración no guardada');return;}
  Object.assign(currentCompany,data);renderCompanyPicker();toast('Nombre y color guardados.');
}
async function uploadLogo(e) {
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>2*1024*1024){toast('El logo no puede superar 2 MB.','Archivo demasiado grande');return;}
  const ext=(file.name.split('.').pop()||'png').toLowerCase(), path=currentCompany.id+'/logo-'+Date.now()+'.'+ext;
  const {error}=await db.storage.from('company-logos').upload(path,file,{upsert:true,contentType:file.type});
  if(error){toast(errorText(error),'No se pudo subir el logo');return;}
  const {data}=db.storage.from('company-logos').getPublicUrl(path);
  const {error:saveError}=await db.from('companies').update({logo_path:data.publicUrl}).eq('id',currentCompany.id);
  if(saveError){toast(errorText(saveError),'No se pudo guardar el logo');return;}
  currentCompany.logo_path=data.publicUrl;renderSettings();toast('Logo actualizado.');
}
async function addCompany() {
  const button=$('#page-empresas .page-head .primary-btn');
  const answer=await formDialog({title:'Añadir empresa',description:'La nueva empresa tendrá sus propios avisos y configuración.',fields:[{key:'name',label:'Nombre de la empresa',required:true}]});
  if(!answer?.name.trim())return;
  if(button)button.disabled=true;
  try {
    const {error}=await db.rpc('create_company_for_self',{company_name:answer.name.trim()});
    if(error)throw error;
    toast('Empresa creada.');
    await loadMemberships();
  } catch(error) { toast(errorText(error),'No se pudo crear la empresa'); }
  finally { if(button)button.disabled=false; }
}
function renderCompanyPage() {
  if(!isSuperAdmin)return;
  const section=$('#page-empresas');if(!section)return;
  let grid=$('.simple-grid',section);if(!grid)return;
  grid.innerHTML=companies.map(c=>`<button class="placeholder-tile" data-company-card="${c.id}" style="text-align:left;cursor:pointer"><div class="company-badge">${esc(c.name.slice(0,2).toUpperCase())}</div><strong>${esc(c.name)}</strong><small>${c.id===currentCompany.id?'Empresa actual':'Cambiar a esta empresa'}</small></button>`).join('')||'<div class="empty">Crea tu primera empresa.</div>';
  $$('[data-company-card]',grid).forEach(b=>b.onclick=()=>{currentCompany=companies.find(c=>c.id===b.dataset.companyCard);renderCompanyPicker();loadCompanyData();});
}
function renderMembers() {
  if(!isSuperAdmin)return;
  const section=$('#page-usuarios');if(!section)return;
  const grid=$('.simple-grid',section);if(grid)grid.innerHTML=members.filter(m=>m.user_id!==user?.id).map(m=>`<div class="placeholder-tile"><strong>${esc(m.email||m.user_id.slice(0,8))}</strong><small>Permisos para esta empresa</small><div class="button-row" style="margin-top:10px"><select data-member-role="${m.user_id}" aria-label="Permisos de ${esc(m.email||'usuario')}"><option value="gestor" ${m.role==='gestor'?'selected':''}>Gestor: avisos e informes</option><option value="consulta" ${m.role==='consulta'?'selected':''}>Consulta: solo lectura</option></select><button class="mini-delete" data-remove-member="${m.user_id}" aria-label="Quitar usuario">×</button></div></div>`).join('')||'<div class="empty">Todavía no hay usuarios normales en esta empresa.</div>';
  $$('[data-member-role]',section).forEach(select=>select.onchange=async()=>{const role=select.value,member=members.find(m=>m.user_id===select.dataset.memberRole);if(!member)return;select.disabled=true;const {error}=await db.from('company_members').update({role}).eq('company_id',currentCompany.id).eq('user_id',member.user_id);select.disabled=false;if(error){toast(errorText(error),'No se pudieron cambiar los permisos');renderMembers();return;}member.role=role;toast(`Permiso actualizado: ${role==='consulta'?'consulta':'gestor'}.`,'Permisos guardados');renderMembers();});
  $$('[data-remove-member]',section).forEach(b=>b.onclick=async()=>{if(!await confirmDialog('¿Retirar este usuario de la empresa?'))return;const {error}=await db.from('company_members').delete().eq('company_id',currentCompany.id).eq('user_id',b.dataset.removeMember);if(error)toast(errorText(error),'No se pudo retirar');else{members=members.filter(m=>m.user_id!==b.dataset.removeMember);renderMembers();}});
  const add=$('.page-head .primary-btn',section);if(add)add.onclick=async()=>{const answer=await formDialog({title:'Invitar usuario',description:'La persona solo tendrá acceso a esta empresa. Elige si podrá gestionar avisos o consultar la información.',fields:[{key:'email',label:'Correo electrónico',type:'email',required:true,autocomplete:'email'},{key:'role',label:'Permiso',type:'select',value:'gestor',options:[{value:'gestor',label:'Gestor: puede registrar y gestionar avisos'},{value:'consulta',label:'Consulta: solo lectura'}]}]});if(!answer)return;const {error}=await db.functions.invoke('invite-member',{body:{company_id:currentCompany.id,email:answer.email.trim(),role:answer.role}});toast(error?errorText(error):'Invitación enviada. El usuario recibirá un correo para acceder.',error?'No se pudo invitar':'Invitación enviada');if(!error)await loadCompanyData();};
}
async function renderIntegrations() {
  if(!isSuperAdmin)return;
  const section=$('#page-integraciones');if(!section)return;
  const old=$('.demo-banner',section);if(old)old.remove();
  $('#addLanding').onclick=async()=>{const answer=await formDialog({title:'Añadir landing',description:'Conecta un formulario web a esta empresa.',fields:[{key:'name',label:'Nombre de la landing',required:true},{key:'url',label:'URL de la landing',placeholder:'https://ejemplo.com'},{key:'domains',label:'Orígenes permitidos (separados por comas)',placeholder:'https://ejemplo.com'}]});if(!answer?.name.trim())return;const name=answer.name,url=answer.url.trim()||null,domains=answer.domains||'';const allowed_origins=domains.split(',').map(x=>x.trim()).filter(Boolean);const {data,error}=await db.from('landings').insert({company_id:currentCompany.id,name:name.trim(),url,allowed_origins}).select().single();if(error){toast(errorText(error),'No se pudo crear la landing');return;}landings.push(data);landings.sort((a,b)=>a.name.localeCompare(b.name));await loadCompanyData();showLandingCode(data);};
  $('#providerCards').innerHTML=`<article class="provider-card"><h4>Telegram</h4><p>Avisos normales y un grupo distinto para reclamaciones o anulaciones.</p><div class="button-row"><button class="outline-btn" data-config-channel="telegram">Configurar Telegram</button><button class="outline-btn" data-test-channel="telegram">Enviar prueba</button></div></article><article class="provider-card"><h4>WhatsApp</h4><p>Elige arriba qué avisos quieres recibir por WhatsApp.</p><div class="button-row"><button class="outline-btn" data-config-channel="whatsapp">Configurar WhatsApp</button><button class="outline-btn" data-test-channel="whatsapp">Enviar prueba</button></div></article><article class="provider-card"><h4>Correo electrónico</h4><p>Envía los tipos de aviso seleccionados a los correos configurados.</p><div class="button-row"><button class="outline-btn" data-config-channel="email">Configurar correo</button><button class="outline-btn" data-test-channel="email">Enviar prueba</button></div></article>`;
  $$('[data-config-channel]',$('#providerCards')).forEach(b=>b.onclick=()=>configureIntegration(b.dataset.configChannel));
  $$('[data-test-channel]',$('#providerCards')).forEach(b=>b.onclick=()=>testIntegration(b.dataset.testChannel));
  await renderNotificationRoutes();
  const host=$('#landingIntegrations');
  host.innerHTML=landings.map(l=>`<div class="placeholder-tile"><strong>${esc(l.name)}${l.is_active?'':' · Inactiva'}</strong><small>${esc(l.url||'Sin URL guardada')}</small><div class="button-row"><button class="outline-btn" data-code="${l.id}">Ver conexión</button><button class="mini-delete" data-delete-landing="${l.id}" aria-label="Desactivar landing">×</button></div></div>`).join('')||'<div class="empty">Todavía no hay landings conectadas.</div>';
  $$('[data-code]',host).forEach(b=>b.onclick=()=>showLandingCode(landings.find(l=>l.id===b.dataset.code)));
  $$('[data-delete-landing]',host).forEach(b=>b.onclick=async()=>{if(!await confirmDialog('¿Desactivar esta landing? Sus avisos y tarifas históricas se conservarán.'))return;const {error}=await db.from('landings').update({is_active:false}).eq('id',b.dataset.deleteLanding);if(error)toast(errorText(error),'No se pudo desactivar');else await loadCompanyData();});
}
async function renderNotificationRoutes() {
  const host=$('#notificationRoutes');if(!host)return;
  host.innerHTML='<div class="empty" style="padding:16px">Cargando destinos…</div>';
  const {data,error}=await db.functions.invoke('manage-integration',{body:{company_id:currentCompany.id,action:'get_routes'}});
  if(error){host.innerHTML=`<div class="empty">No se pudieron cargar los destinos: ${esc(errorText(error))}</div>`;return;}
  const channels=data?.channels||[],routes=data?.routes||{form:[],phone:[],complaint:[]},blocked=data?.blocked||{form:[],phone:[],complaint:[]};
  const rows=[['form','Avisos recibidos por formulario web'],['phone','Avisos telefónicos marcados «Aviso Sacado»'],['complaint','Reclamaciones o anulaciones']];
  host.innerHTML=`<table class="route-table"><thead><tr><th>TIPO DE AVISO</th><th>TELEGRAM</th><th>WHATSAPP</th><th>CORREO</th></tr></thead><tbody>${rows.map(([type,label])=>`<tr><td>${label}</td>${[['telegram','Telegram'],['whatsapp','WhatsApp'],['email','Correo']].map(([channel])=>{const unavailable=blocked[type]?.includes(channel);return `<td><input type="checkbox" aria-label="Enviar ${label} por ${channel}" data-route-type="${type}" data-route-channel="${channel}" ${routes[type]?.includes(channel)?'checked':''} ${channels.includes(channel)&&!unavailable?'':'disabled'} ${unavailable?'title="Configura un grupo de Telegram distinto para este destino"':''} /></td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
  const hint=$('#routeSaveHint');if(hint)hint.textContent=blocked.complaint?.includes('telegram')?'Para activar Telegram aquí, vuelve a configurarlo con el ID del grupo distinto para reclamaciones o anulaciones.':channels.length?'Marca los destinos que quieras usar y guarda.':'Configura al menos un canal para poder elegirlo aquí.';
  const save=$('#saveNotificationRoutes');if(save){save.disabled=!channels.length;save.onclick=async()=>{const selected={form:[],phone:[],complaint:[]};$$('[data-route-type]',host).forEach(input=>{if(input.checked)selected[input.dataset.routeType].push(input.dataset.routeChannel);});save.disabled=true;const result=await db.functions.invoke('manage-integration',{body:{company_id:currentCompany.id,action:'save_routes',routes:selected}});save.disabled=false;if(result.error){toast(errorText(result.error),'No se pudieron guardar los destinos');return;}toast('Se han guardado los canales seleccionados.','Destinos guardados');}};
}
async function configureIntegration(kind) {
  let config={};
  if(kind==='telegram') {
    const answer=await formDialog({title:'Configurar Telegram',description:'Usa el mismo bot, pero indica el grupo de avisos y otro grupo separado para reclamaciones o anulaciones.',fields:[{key:'bot_token',label:'Token del bot',type:'password',required:true},{key:'chat_id',label:'ID del grupo para avisos',required:true},{key:'complaint_chat_id',label:'ID del grupo para reclamaciones o anulaciones',required:true}]});
    if(!answer)return;config=answer;
  } else if(kind==='whatsapp') {
    const answer=await formDialog({title:'Configurar WhatsApp Business',description:'Necesitas tu token y el ID del número de WhatsApp de Meta, un número de destino con prefijo de país y una plantilla de mensaje aprobada. Sin programación: el CRM rellena automáticamente 5 variables.',fields:[{key:'access_token',label:'Token de acceso de Meta',type:'password',required:true},{key:'phone_number_id',label:'ID del número de WhatsApp',required:true},{key:'to',label:'Número que recibirá los avisos (con prefijo de país)',placeholder:'34600111222',required:true},{key:'template_name',label:'Nombre de la plantilla aprobada',placeholder:'aviso_nuevo',required:true},{key:'language',label:'Idioma de la plantilla',placeholder:'es',value:'es',required:true}]});
    if(!answer)return;config={...answer,to:answer.to.replace(/\D/g,'')};
  } else {
    const answer=await formDialog({title:'Configurar correo',description:'Datos del servicio de envío Resend.',fields:[{key:'api_key',label:'API key de Resend',type:'password',required:true},{key:'from',label:'Remitente verificado',placeholder:'CRM <avisos@dominio.com>',required:true},{key:'to',label:'Correos destinatarios (separados por comas)',type:'textarea',required:true}]});
    if(!answer)return;config={...answer,to:answer.to.split(',').map(x=>x.trim()).filter(Boolean)};
  }
  const {error}=await db.functions.invoke('manage-integration',{body:{company_id:currentCompany.id,kind,config,enabled:true}});
  toast(error?errorText(error):'Integración guardada de forma privada.',error?'No se pudo guardar':'Conexión guardada');
  if(!error)await renderNotificationRoutes();
}
async function testIntegration(kind) {
  const {error}=await db.functions.invoke('notify-test',{body:{company_id:currentCompany.id,kind}});
  toast(error?errorText(error):'Mensaje de prueba enviado.',error?'No se pudo enviar':'Prueba enviada');
}
function showLandingCode(landing) {
  if(!landing)return;
  const endpoint=CFG.url.replace(/\/$/,'')+'/functions/v1/service-form';
  const code=`fetch('${endpoint}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({landing_key:'${landing.endpoint_key}',data:{customer_name:'Nombre',phone:'600000000',device:'Lavadora',issue:'Descripción de la avería'}})}).then(r=>r.json())`;
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop open';backdrop.innerHTML=`<div class="modal" style="max-width:640px"><div class="modal-head"><div><h2>Conectar ${esc(landing.name)}</h2><p>Endpoint y ejemplo de envío desde el formulario.</p></div><button class="close">×</button></div><p><strong>URL:</strong></p><div class="integration-code">${esc(endpoint)}</div><p><strong>Clave de landing:</strong></p><div class="integration-code">${esc(landing.endpoint_key)}</div><p><strong>Ejemplo JavaScript:</strong></p><div class="integration-code">${esc(code)}</div><div class="modal-actions"><button class="outline-btn" id="copyLandingCode">Copiar código</button><button class="primary-btn close-code">Cerrar</button></div></div>`;
  document.body.append(backdrop);$('.close',backdrop).onclick=()=>backdrop.remove();$('.close-code',backdrop).onclick=()=>backdrop.remove();$('#copyLandingCode',backdrop).onclick=async()=>{await navigator.clipboard.writeText(code);toast('Código copiado.');};
}

function showPage(name) {
  if(!isSuperAdmin&&!['avisos-landing','avisos-phone','informes','reclamaciones'].includes(name))return;
  const pageName=(name==='avisos-landing'||name==='avisos-phone')?'avisos':name;
  $$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+pageName));
  $$('.nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  const labels={'avisos-landing':'Avisos por formulario','avisos-phone':'Avisos por teléfono',informes:'Informes',reclamaciones:'Reclamaciones o anulaciones',empresas:'Empresas',usuarios:'Usuarios y permisos',configuracion:'Configuración',integraciones:'Integraciones'};
  $('#breadcrumb').textContent='Panel / '+labels[name];
  if(pageName==='avisos'){
    noticeSource=name==='avisos-phone'?'phone':'landing';
    setNoticeView(localStorage.getItem(`crm-service-notice-view:${currentCompany?.id}:${noticeSource}`)||'table');
    const phone=noticeSource==='phone';
    $('#page-avisos h1').textContent=phone?'Avisos por teléfono':'Avisos por formulario';
    $('#page-avisos .page-head p').textContent=phone?'Registra y gestiona los avisos que recibes por llamada telefónica.':'Solicitudes recibidas desde formularios web.';
    $('#newNotice').style.display=phone?'inline-flex':'none';
    $('#latestNoticesTitle').textContent=phone?'Últimos avisos por teléfono':'Últimos avisos por formulario';
    renderRows();
  }
  if(pageName==='reclamaciones')renderComplaints();
  $('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});
}
function wireUI() {
  $('#sidebar').addEventListener('click',event=>{const button=event.target.closest('button[data-page]');if(button){event.preventDefault();showPage(button.dataset.page);}});
  setupDate('main');setupDate('report');
  ['tableSearch','globalSearch'].forEach(id=>$('#'+id).addEventListener('input',renderRows));
  ['statusFilter','landingFilter','weekdayFilter'].forEach(id=>$('#'+id).addEventListener('change',renderRows));
  ['reportWeekday','reportLanding','reportStatus'].forEach(id=>$('#'+id).addEventListener('change',renderReport));
  $$('[data-notice-view]').forEach(button=>button.addEventListener('click',()=>setNoticeView(button.dataset.noticeView)));
  $('#cardFieldsToggle').addEventListener('click',()=>{$('#cardFieldPanel').hidden=!$('#cardFieldPanel').hidden;});
  $('#newNotice').addEventListener('click',()=>openPhoneNotice('aviso'));
  $('#newComplaint').addEventListener('click',()=>openPhoneNotice('reclamacion'));
  $('#fRecordType').addEventListener('change',()=>{syncDefaultFields();renderExtraFields();updateRecordFormMode();});
  $('#closeModal').addEventListener('click',()=>$('#modal').classList.remove('open'));
  $('#cancelModal').addEventListener('click',()=>$('#modal').classList.remove('open'));
  $('#modal').addEventListener('click',e=>{if(e.target.id==='modal')e.currentTarget.classList.remove('open');});
  $('#noticeForm').addEventListener('submit',createNotice);
  $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  $('#pendingLandingButton').addEventListener('click',()=>{$('#statusFilter').value='Nuevo';renderRows();});
  $('#exportBtn').addEventListener('click',()=>exportCsv(false));$('#reportExport').addEventListener('click',()=>exportCsv(true));
  $('#addField').addEventListener('click',addField);
  $$('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>showSettingsTab(button.dataset.settingsTab)));
  $('#fieldLandingFilter').addEventListener('change',()=>{$('#newFieldLanding').value=$('#fieldLandingFilter').value;renderFields();});
  $('#page-empresas .page-head .primary-btn').addEventListener('click',addCompany);
  $('#saveSettings').addEventListener('click',saveCompanySettings);
  $('#addPrice').addEventListener('click',addTariff);
}
async function addField() {
  const label=$('#newFieldName').value.trim();if(!label)return;
  const field_type=({Texto:'text',Número:'number',Fecha:'date',Lista:'select',Casilla:'checkbox'})[$('#newFieldType').value]||'text';
  const key=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  let options=[];if(field_type==='select'){const answer=await formDialog({title:'Opciones del campo',description:'Escribe las opciones separadas por comas.',fields:[{key:'options',label:'Opciones',type:'text',required:true}]});if(!answer)return;options=answer.options.split(',').map(x=>x.trim()).filter(Boolean);}
  const landing_id=fieldScope==='landing'?($('#newFieldLanding')?.value||null):null;
  const {data,error}=await db.from('notice_fields').insert({company_id:currentCompany.id,landing_id,channel:fieldScope,field_key:key,label,field_type,options,required:false,visible_in_form:true,visible_in_table:true,visible_on_card:true,position:fieldEditorRows.length+1}).select().single();
  if(error){toast(errorText(error),'No se pudo añadir');return;}fields.push(data);$('#newFieldName').value='';renderFields();renderRows();renderExtraFields();
}
async function addTariff() {
  if(!landings.length){toast('Crea primero una landing.');return;}
  const next=landings.flatMap(l=>['Gama blanca','Clima'].map(category=>({landing_id:l.id,category}))).find(candidate=>!tariffs.some(t=>t.landing_id===candidate.landing_id&&t.category===candidate.category));
  if(!next){toast('Ya hay una tarifa para Gama blanca y Clima en cada landing.');return;}
  const {data,error}=await db.from('tariffs').insert({...next,company_id:currentCompany.id,price:0}).select().single();
  if(error){toast(errorText(error),'No se pudo crear tarifa');return;}tariffs.push(data);renderPriceRules();
}
async function exportCsv(report=false) {
  const rows=filteredNotices(report);
  const columns=['Recibido','Estado','Cliente','Teléfono','Correo','Landing','Aparato','Categoría','Localidad','Código postal','Marca','Avería','Importe',...fields.filter(f=>f.visible_in_table).map(f=>f.label)];
  const csv=[columns,...rows.map(n=>[formatDate(n.received_at),statusLabel(n.status),n.customer_name,n.phone,n.email||'',landingName(n.landing_id),n.device||'',n.category||'',n.locality||'',n.postal_code||'',n.brand||'',n.issue||'',n.status==='Sale'?n.unit_price:'',...fields.filter(f=>f.visible_in_table).map(f=>n.custom_fields?.[f.field_key]??n[f.field_key]??'')])].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='avisos-'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(a.href);
}
document.addEventListener('DOMContentLoaded',()=>{wireUI();openAuth();if(!db)return;db.auth.getSession().then(({data,error})=>{if(error){$('#authError').textContent=errorText(error);return;}if(data.session){user=data.session.user;loadMemberships().catch(e=>{const message='No se pudo cargar tu empresa: '+errorText(e);setConnectionError(message);if($('#authError'))$('#authError').textContent=message;});}});db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session){user=session.user;setTimeout(()=>loadMemberships().catch(e=>{const message='No se pudo cargar tu empresa: '+errorText(e);setConnectionError(message);if($('#authError'))$('#authError').textContent=message;openAuth();}),0);}if(event==='SIGNED_OUT'){user=null;location.reload();}});});

