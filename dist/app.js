const CFG = window.CRM_SUPABASE_CONFIG || {};
const hasBackend = !!(CFG.url && CFG.publishableKey && window.supabase?.createClient);
const db = hasBackend ? window.supabase.createClient(CFG.url, CFG.publishableKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => Number(value || 0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const categoryFor = device => /aire acondicionado|aerotermia|bomba de calor|acs|caldera|calentador|termo/i.test(String(device||'')) ? 'Clima' : (device ? 'Gama blanca' : null);
let user=null, isSuperAdmin=false, companies=[], currentCompany=null, landings=[], notices=[], tariffs=[], fields=[], members=[], appointments=[], calendarConnection=null, realtimeChannel=null, realtimeCompanyId=null, membershipLoadPromise=null, membershipLoadStage='inicio', noticeSource='landing', fieldScope='phone', noticeView='table', relatedNoticeMatch=null, selectedHistoryKey=null, duplicatePhoneBypass=null, agendaMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1), agendaSelectedDate=null, googleCalendarAccessToken=null, googleCalendarAccessExpiresAt=0, googleCalendarAccessCompanyId=null;
let landingRoutes={}, notificationChannels=[], formDestinations={}, globalFormRoutes=[];
let landingListCollapsed=localStorage.getItem('crm-landings-list-collapsed')==='true';
let fieldEditorRows=[],fieldDragSource=null;
let authMode='login', selectedDate=new Date().toISOString().slice(0,10), showResendConfirmation=false;
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
    const backdrop=document.createElement('div');backdrop.className='modal-backdrop open';const highestBackdropZ=[...document.querySelectorAll('.modal-backdrop')].reduce((max,el)=>Math.max(max,Number(el.style.zIndex)||0),110);backdrop.style.zIndex=String(Math.max(120,highestBackdropZ+10));
    const controls=fields.map(f=>{
      const label=esc(f.label),key=esc(f.key),value=esc(f.value??''),required=f.required?'required':'';
      let control;
      if(f.type==='select')control=`<select name="${key}" ${required}>${(f.options||[]).map(o=>{const v=typeof o==='string'?o:o.value,l=typeof o==='string'?o:o.label;return `<option value="${esc(v)}" ${String(v)===String(f.value??'')?'selected':''}>${esc(l)}</option>`;}).join('')}</select>`;
      else if(f.type==='textarea')control=`<textarea name="${key}" rows="3" ${required} placeholder="${esc(f.placeholder||'')}">${value}</textarea>`;
      else if(f.type==='checkbox')control=`<input name="${key}" type="checkbox" style="width:16px;height:16px;padding:0;margin:0;flex:0 0 16px;accent-color:var(--accent)" ${f.value?'checked':''} ${required}/>`;
      else if(f.type==='file')control=`<input name="${key}" type="file" accept="${esc(f.accept||'')}" ${required}/>`;
      else control=`<input name="${key}" type="${esc(f.type||'text')}" value="${value}" ${required} placeholder="${esc(f.placeholder||'')}" ${f.autocomplete?`autocomplete="${esc(f.autocomplete)}"`:''}/>`;
      if(f.type==='checkbox')return `<label class="field" style="display:flex;align-items:center;gap:9px;margin:12px 0">${control}<span style="margin:0">${label}</span></label>`;
      return `<label class="field" style="margin:12px 0"><span>${label}</span>${control}</label>`;
    }).join('');
    backdrop.innerHTML=`<form class="modal" style="max-height:90vh;overflow:auto" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button class="close" type="button" data-dialog-cancel aria-label="Cerrar">×</button></div>${controls}<div class="modal-actions"><button class="outline-btn" type="button" data-dialog-cancel>Cancelar</button><button class="primary-btn" type="submit">${esc(confirmText)}</button></div></form>`;
    const finish=value=>{backdrop.remove();resolve(value);};
    backdrop.addEventListener('click',e=>{const target=e.target;if(target===backdrop||(target instanceof Element&&target.closest('[data-dialog-cancel]'))){e.preventDefault();e.stopPropagation();finish(null);}});
    $('form',backdrop).addEventListener('submit',e=>{e.preventDefault();const result={};for(const f of fields){const el=$('[name="'+CSS.escape(f.key)+'"]',backdrop);result[f.key]=f.type==='checkbox'?el.checked:f.type==='number'?Number(el.value):f.type==='file'?(el.files?.[0]||null):el.value;}finish(result);});
    document.body.append(backdrop);$('[name]',backdrop)?.focus();
  });
}
function infoDialog(title,content) {
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop open';const highestBackdropZ=[...document.querySelectorAll('.modal-backdrop')].reduce((max,el)=>Math.max(max,Number(el.style.zIndex)||0),110);backdrop.style.zIndex=String(Math.max(120,highestBackdropZ+10));
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
  style.textContent=`.auth-screen{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:linear-gradient(135deg,#eef1ff,#f8f9fc 55%,#e9f5f1);padding:18px}.auth-card{width:min(440px,100%);background:white;border:1px solid #e4e8f1;border-radius:18px;box-shadow:0 24px 70px #1a26431a;padding:30px}.auth-mark{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:white;font-size:20px;font-weight:800;background:linear-gradient(145deg,var(--accent-gradient-start),var(--accent));margin-bottom:18px}.auth-card h1{margin:0 0 7px;font-size:24px;color:#182235}.auth-card p{margin:0 0 20px;color:#788397;font-size:13px}.auth-card form{display:grid;gap:12px}.auth-card label{display:grid;gap:6px;color:#58647a;font-size:12px;font-weight:600}.auth-card input{height:42px;border:1px solid #dfe3ec;border-radius:8px;padding:0 12px;font:inherit}.auth-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:16px}.auth-actions button{border:0;background:none;color:var(--accent);font-weight:650;cursor:pointer}.auth-error{min-height:18px;color:#bf4257;font-size:12px;margin-top:11px}.auth-muted{font-size:11px;color:#8893a6;margin-top:14px;line-height:1.5}.auth-screen .primary-btn{height:42px;font-size:13px}.user{gap:7px}.signout-btn{border:1px solid var(--line);background:#fff;color:#657186;border-radius:8px;padding:7px 9px;font-size:11px}.company-select select{border:0;background:transparent;color:#334057;font:inherit;max-width:180px;outline:none}.integration-code{white-space:pre-wrap;word-break:break-all;background:#f5f6fa;border:1px solid #e3e7ef;border-radius:8px;padding:11px;font:11px/1.5 ui-monospace,monospace;color:#48546a}.danger-text{color:#be4357}.button-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.field-row{gap:10px}.company-select{cursor:pointer}`;
  document.head.append(style);
  const screen=document.createElement('div');screen.className='auth-screen';screen.id='authScreen';
  screen.innerHTML=`<section class="auth-card"><div class="auth-mark">S</div><h1>CRM Gestión de avisos</h1><p id="authIntro">Accede a los avisos y la configuración de tu empresa.</p><form id="authForm"><label>Correo electrónico<input id="authEmail" type="email" autocomplete="email" required placeholder="nombre@empresa.com"/></label><label>Contraseña<input id="authPassword" type="password" autocomplete="current-password" minlength="8" required placeholder="Mínimo 8 caracteres"/></label><button class="primary-btn" id="authSubmit" type="submit">Entrar</button></form><div class="auth-error" id="authError" role="status" aria-live="polite"></div><div class="auth-actions"><button id="authSwitch" type="button">Crear cuenta</button><button id="resendConfirmation" type="button" hidden>Reenviar verificación</button><button id="forgotPassword" type="button">He olvidado la contraseña</button></div><div class="auth-muted" id="authNote">Cada empresa y sus avisos quedan aislados por permisos de base de datos.</div></section>`;
  document.body.append(screen);
  const pendingEmail=localStorage.getItem('crm-pending-confirmation-email');if(pendingEmail){$('#authEmail').value=pendingEmail;showResendConfirmation=true;$('#resendConfirmation').hidden=false;}
  $('#authForm').addEventListener('submit',handleAuth);
  $('#authSwitch').addEventListener('click',()=>setAuthMode(authMode==='login'?'signup':'login'));
  $('#forgotPassword').addEventListener('click',resetPassword);
  $('#resendConfirmation').addEventListener('click',resendConfirmation);
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
  $('#resendConfirmation').hidden=!showResendConfirmation;
  $('#authPassword').autocomplete=mode==='login'?'current-password':'new-password';
}
async function handleAuth(event) {
  event.preventDefault(); if(!db)return;
  const email=$('#authEmail').value.trim(), password=$('#authPassword').value, message=$('#authError');
  message.textContent='Conectando…'; $('#authSubmit').disabled=true;
  try {
    if(authMode==='login') {
      const {error}=await db.auth.signInWithPassword({email,password}); if(error)throw error;
      localStorage.removeItem('crm-pending-confirmation-email');showResendConfirmation=false;message.textContent='Acceso correcto.';
    } else {
      localStorage.removeItem('crm-service-first-company');
      const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:appRedirectUrl()}});
      if(error)throw error;
      if(data.session) {
        message.textContent='Cuenta creada. El superadministrador debe asignarte a una empresa para acceder.';
      } else {
        message.textContent='Te enviamos un correo para confirmar la cuenta. Después vuelve aquí e inicia sesión.';
        localStorage.setItem('crm-pending-confirmation-email',email);showResendConfirmation=true;$('#resendConfirmation').hidden=false;
      }
    }
  } catch(error) { message.textContent=errorText(error);if(/confirm|not verified|not confirmed/i.test(String(error?.message||''))){showResendConfirmation=true;$('#resendConfirmation').hidden=false;} }
  finally { $('#authSubmit').disabled=false; }
}
function appRedirectUrl() { return new URL('./',window.location.href).toString(); }
async function resendConfirmation() {
  if(!db)return;
  const email=$('#authEmail').value.trim();if(!email){$('#authError').textContent='Escribe primero tu correo electrónico.';return;}
  const button=$('#resendConfirmation');button.disabled=true;
  const {error}=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:appRedirectUrl()}});
  $('#authError').textContent=error?errorText(error):'Te hemos enviado otro correo de verificación. Abre el enlace y vuelve al CRM.';
  button.disabled=false;
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
async function loadMembershipsOnce() {
  membershipLoadStage='comprobando el perfil';
  const {data:globalRole,error:globalRoleError}=await db.rpc('is_super_admin');
  if(globalRoleError)throw globalRoleError;
  isSuperAdmin=globalRole===true;applyAccessPermissions();
  membershipLoadStage='cargando permisos de usuario';
  const {data,error}=await db.from('company_members').select('company_id,user_id,email,role').eq('user_id',user.id);
  if(error)throw error; members=Array.isArray(data)?data:[];
  applyAccessPermissions();
  const ids=[...new Set(members.map(m=>m.company_id))];
  if(!isSuperAdmin&&!ids.length){showOnboarding();return;}
  membershipLoadStage='cargando empresas';
  const companyQuery=db.from('companies').select('*').order('created_at');
  const {data:rows,error:companyError}=isSuperAdmin?await companyQuery:await companyQuery.in('id',ids);
  if(companyError)throw companyError;
  companies=Array.isArray(rows)?rows:[];
  if(!companies.length){
    currentCompany=null;
    if(!isSuperAdmin){showOnboarding();return;}
    $('#authScreen')?.remove();mountSignOut();renderCompanyPicker();renderCompanyPage();showPage('empresas');return;
  }
  membershipLoadStage='preparando la empresa seleccionada';
  currentCompany=companies.find(c=>c.id===currentCompany?.id)||companies[0];
  $('#authScreen')?.remove();
  membershipLoadStage='montando cabecera de usuario';mountSignOut();
  membershipLoadStage='dibujando selector de empresa';renderCompanyPicker();
  membershipLoadStage='dibujando lista de empresas';renderCompanyPage();
  membershipLoadStage='dibujando usuarios';renderMembers();
  membershipLoadStage='cargando integraciones';renderIntegrations();
  membershipLoadStage='cargando configuración';renderSettings();
  membershipLoadStage='cargando datos de empresa';await loadCompanyData();
  membershipLoadStage='carga completada';
}
async function loadMemberships() {
  if(membershipLoadPromise)return membershipLoadPromise;
  setConnectionError('');membershipLoadStage='iniciando';
  const pending=loadMembershipsOnce();
  membershipLoadPromise=pending;
  try{return await pending;}finally{if(membershipLoadPromise===pending)membershipLoadPromise=null;}
}
function showMembershipLoadError(error){
  const frame=String(error?.stack||'').split('\n').slice(1,2).join('').trim();
  const message='No se pudo cargar tu empresa ('+membershipLoadStage+'): '+errorText(error);
  setConnectionError(message);
  const box=$('#connectionError');if(box)box.title=frame;
  return message;
}
function showOnboarding() {
  localStorage.removeItem('crm-service-first-company');
  $('#authIntro').textContent='Tu cuenta todavía no está asociada a una empresa.';
  $('#authForm').hidden=true;$('#authSwitch').hidden=true;$('#forgotPassword').hidden=true;
  $('#authError').textContent='Pide al superadministrador que te invite a la empresa correspondiente.';
}
function applyAccessPermissions() {
  members=Array.isArray(members)?members:[];companies=Array.isArray(companies)?companies:[];
  const adminNav=$$('[data-admin-only]');adminNav.forEach(el=>el.hidden=!isSuperAdmin);
  const picker=$('.company-select');if(picker)picker.hidden=!isSuperAdmin;
  const separator=$('.top-sep');if(separator)separator.hidden=!isSuperAdmin;
  const current=members.find(m=>m.user_id===user?.id);
  $$('[data-page]').forEach(button=>{if(['empresas','usuarios','personalizacion','configuracion','integraciones'].includes(button.dataset.page))button.hidden=!isSuperAdmin;});
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
function renderCompanyBrand() {
  const brand=$('.brand');if(!brand)return;
  const mark=$('.brand-mark',brand),name=$('.brand small',brand);
  if(mark){
    if(currentCompany?.logo_path)mark.innerHTML=`<img src="${esc(currentCompany.logo_path)}" alt="Logo de ${esc(currentCompany.name||'la empresa')}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;background:#fff;padding:3px"/>`;
    else mark.textContent=(currentCompany?.name||'T').trim().slice(0,1).toUpperCase();
  }
  if(name)name.textContent=currentCompany?.name||'Servicio técnico';
}
function renderCompanyPicker() {
  const old=$('.company-select');if(!old)return;
  if(!isSuperAdmin){old.hidden=true;const separator=$('.top-sep');if(separator)separator.hidden=true;return;}
  if(!currentCompany){old.innerHTML='<span class="company-badge">+</span><span>Sin empresas</span>';return;}
  const select=document.createElement('label');select.className='company-select';
  select.innerHTML=`<span class="company-badge">${esc((currentCompany.name||'GT').slice(0,2).toUpperCase())}</span><select id="companySwitch" aria-label="Empresa"></select>`;
  old.replaceWith(select);
  $('#companySwitch').innerHTML=companies.map(c=>`<option value="${c.id}" ${c.id===currentCompany.id?'selected':''}>${esc(c.name)}</option>`).join('');
  $('#companySwitch').addEventListener('change',async e=>{currentCompany=companies.find(c=>c.id===e.target.value);await loadCompanyData();});
  applyCompanyTheme(currentCompany.primary_color);
  renderCompanyBrand();
}
async function fetchAllNotices(companyId) {
  const all=[];let from=0;const batch=1000;
  while(true){const {data,error}=await db.from('notices').select('*').eq('company_id',companyId).order('received_at',{ascending:false}).range(from,from+batch-1);if(error)throw error;all.push(...(data||[]));if(!data||data.length<batch)break;from+=batch;}
  return {data:all,error:null};
}
async function loadCompanyData() {
  if(!currentCompany)return;
  membershipLoadStage='actualizando marca de empresa';renderCompanyBrand();
  membershipLoadStage='aplicando tema de empresa';applyCompanyTheme(currentCompany.primary_color);
  document.title=currentCompany.name+' · CRM Gestión de avisos';
  try {
    const c=currentCompany.id;
    membershipLoadStage='consultando tablas de empresa';
    const results=await Promise.all([
      db.from('landings').select('*').eq('company_id',c).order('name'),
      fetchAllNotices(c),
      db.from('tariffs').select('*').eq('company_id',c),
      db.from('notice_fields').select('*').eq('company_id',c).order('position'),
      db.from('company_members').select('company_id,user_id,email,role').eq('company_id',c).order('email'),
      db.from('appointments').select('*').eq('company_id',c).order('start_at'),
      db.from('calendar_connections').select('*').eq('company_id',c).maybeSingle()
    ]);
    membershipLoadStage='validando las respuestas de base de datos';
    for(const r of results)if(r.error)throw r.error;
    [landings,notices,tariffs,fields,members]=results.slice(0,5).map(r=>Array.isArray(r.data)?r.data:[]);
    appointments=Array.isArray(results[5].data)?results[5].data:[];
    calendarConnection=results[6].data||null;
    if(googleCalendarAccessCompanyId!==c){googleCalendarAccessToken=null;googleCalendarAccessExpiresAt=0;googleCalendarAccessCompanyId=null;}
    applyAccessPermissions();
    membershipLoadStage='preparando campos de avisos';
    if(!fields.length){const seeds=['phone','landing'].flatMap(channel=>defaultFields.map(f=>({...f,channel,options:f.options||[],company_id:c})));const {data:createdFields,error}=await db.from('notice_fields').insert(seeds).select();if(error)throw error;fields=createdFields||[];}
    membershipLoadStage='conectando avisos en tiempo real';
    if(realtimeChannel&&realtimeCompanyId!==c){const oldChannel=realtimeChannel;realtimeChannel=null;realtimeCompanyId=null;try{await db.removeChannel(oldChannel);}catch(removeError){console.warn('No se pudo cerrar la suscripción anterior de avisos',removeError);}}
    if(!realtimeChannel){realtimeCompanyId=c;realtimeChannel=db.channel('notices-'+c).on('postgres_changes',{event:'INSERT',schema:'public',table:'notices',filter:'company_id=eq.'+c},payload=>{const incoming=payload.new;if(incoming?.company_id===currentCompany?.id&&!notices.some(n=>n.id===incoming.id)){notices.unshift(incoming);renderRows();renderComplaints();renderClientHistory();}}).subscribe();}
    membershipLoadStage='limpiando banners';Array.from(document.querySelectorAll('.demo-banner')).forEach(el=>el.remove());setConnectionError('');
    membershipLoadStage='dibujando opciones de landing';renderLandingOptions();
    membershipLoadStage='dibujando tabla de avisos';renderRows();
    membershipLoadStage='dibujando informes';renderReport();
    membershipLoadStage='dibujando reclamaciones';renderComplaints();
    membershipLoadStage='dibujando historial';renderClientHistory();
    membershipLoadStage='dibujando agenda';renderAgenda();
    membershipLoadStage='dibujando campos';renderFields();
    membershipLoadStage='dibujando tarifas';renderPriceRules();
    membershipLoadStage='dibujando empresas';renderCompanyPage();
    membershipLoadStage='dibujando usuarios';renderMembers();
    membershipLoadStage='dibujando integraciones';renderIntegrations();
    membershipLoadStage='dibujando configuración';renderSettings();
    membershipLoadStage='cargando usuario';mountSignOut();
  } catch(error) {
    const originalStage=membershipLoadStage, originalMessage=errorText(error);
    console.error('Error al cargar datos de empresa',originalStage,error);
    Array.from(document.querySelectorAll('.demo-banner')).forEach(el=>el.remove());
    const safeRender=(stage,fn)=>{membershipLoadStage=stage;try{fn();}catch(renderError){console.error('Error al limpiar vista tras fallo',stage,renderError);}};
    safeRender('limpiando tabla de avisos',()=>{renderLandingOptions();renderRows();});
    safeRender('limpiando informes',renderReport);
    safeRender('limpiando reclamaciones',renderComplaints);
    safeRender('limpiando historial',renderClientHistory);
    safeRender('limpiando agenda',renderAgenda);
    safeRender('limpiando campos',renderFields);
    safeRender('limpiando tarifas',renderPriceRules);
    safeRender('limpiando empresas',renderCompanyPage);
    safeRender('limpiando usuarios',renderMembers);
    safeRender('limpiando integraciones',renderIntegrations);
    safeRender('limpiando configuración',renderSettings);
    const message='No se pudieron cargar los datos de esta empresa ('+originalStage+'): '+originalMessage;
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
function statusLabel(s) { return s==='Sale'?'Aviso Sacado':s==='No sale'?'Aviso no sacado':s==='Nuevo'?'Nuevo':'—'; }
function statusClass(s) { return s==='Sale'?'sold':s==='No sale'?'lost':'new'; }
function getUnitPrice(n) {
  if(n.status==='Sale')return Number(n.unit_price||0);
  const t=tariffs.find(x=>x.landing_id===n.landing_id&&x.category===n.category);return 0;
}
function normalizeLocality(value) { return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es-ES'); }
function tariffForNotice(notice) {
  if(notice.landing_id)return tariffs.find(t=>(t.scope||'landing')==='landing'&&t.landing_id===notice.landing_id&&t.category===notice.category)||null;
  const city=normalizeLocality(notice.locality);
  if(!city)return null;
  return tariffs.find(t=>t.scope==='phone'&&t.category===notice.category&&normalizeLocality(t.locality)===city)||null;
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
  const labels={Nuevo:'Avisos nuevos',Sale:'Aviso Sacado', 'No sale':'Aviso no sacado'};
  const chosen=selectedCardFields(),available=noticeFieldsForCards().filter(f=>chosen.includes(f.field_key)&&f.field_key!=='customer_name');
  board.innerHTML=['Nuevo','Sale','No sale'].map(status=>{
    const cards=rows.filter(n=>(n.status||'Nuevo')===status).map(n=>{
      const customer=n.customer_name||'Sin nombre';
      const details=available.map(f=>{
        const value=n.custom_fields?.[f.field_key]??n[f.field_key]??'';
        return value!==''&&value!==null&&value!==undefined?`<span><b>${esc(f.label)}:</b> ${esc(value)}</span>`:'';
      }).filter(Boolean).join('');
      const origin=n.created_by?'Teléfono':landingName(n.landing_id);
      return `<article class="notice-card" draggable="${canManageCurrentNotices()}" data-card-id="${esc(n.id)}"><div class="notice-card-head"><div><strong>${esc(customer)}</strong></div><button type="button" class="row-action" data-open-card="${esc(n.id)}" aria-label="Ver aviso">···</button></div><div class="notice-card-fields">${details}<span><b>Origen:</b> ${esc(origin)}</span><span><b>Recibido:</b> ${esc(formatDate(n.received_at))}</span></div><div class="notice-card-foot"><select data-card-status="${esc(n.id)}" aria-label="Cambiar estado del aviso" ${canManageCurrentNotices()?'':'disabled'}>${['Nuevo','Sale','No sale'].map(s=>`<option value="${s}" ${s===status?'selected':''}>${esc(statusLabel(s))}</option>`).join('')}</select>${status==='Sale'?`<small>${money(getUnitPrice(n))}</small>`:''}</div></article>`;
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
    column.addEventListener('drop',async event=>{event.preventDefault();column.classList.remove('drag-over');const id=event.dataTransfer.getData('text/plain');if(id)await handleNoticeStatusChange(id,column.dataset.dropStatus,null);});
  });
  $$('[data-card-status]',board).forEach(select=>select.addEventListener('change',event=>handleNoticeStatusChange(event.target.dataset.cardStatus,event.target.value,event.target)));
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
    return `<tr>${cells}<td><span class="source">${esc(sourceLabel)}</span></td><td>${esc(formatDate(n.received_at))}</td><td><select class="status ${statusClass(n.status)}" data-status-id="${n.id}" aria-label="Cambiar estado" ${canManage?'':'disabled'}>${['Nuevo','Sale','No sale'].map(s=>`<option value="${esc(s)}" ${s===n.status?'selected':''}>${esc(statusLabel(s))}</option>`).join('')}</select></td><td>${n.status==='Sale'?money(getUnitPrice(n)):'—'}</td><td><div class="notice-row-actions"><button class="row-action" data-open-id="${n.id}" aria-label="Ver aviso" title="Ver aviso">···</button>${canManageCurrentNotices()?`<button class="row-action" data-edit-id="${n.id}" aria-label="Editar aviso" title="Editar aviso">✎</button>`:'' }${isSuperAdmin?`<button class="row-action notice-delete" data-delete-id="${n.id}" aria-label="Eliminar aviso" title="Eliminar aviso">×</button>`:''}</div></td></tr>`;
  }).join('');
  $('#emptyState').hidden=rows.length>0;
  const sourceTotal=notices.filter(n=>n.notice_type==='aviso'&&(noticeSource==='phone'?!!n.created_by:!!n.landing_id)).length;
  $('#rowCount').textContent=`Mostrando ${rows.length} de ${sourceTotal} avisos`;
  renderCardFieldPanel();renderKanban(rows);
  const fresh=rows.filter(n=>n.status==='Nuevo').length,sold=rows.filter(n=>n.status==='Sale').length,lost=rows.filter(n=>n.status==='No sale').length,total=rows.length,managed=sold+lost;
  $('#mTotal').textContent=total;$('#mNew').textContent=fresh;$('#mSold').textContent=sold;$('#mLost').textContent=lost;
  $('#pendingMetric')?.classList.toggle('metric-pending',fresh>0);
  $('#mConversion').textContent=`${managed?Math.round(sold/managed*100):0} %`;$('#mLostPercent').textContent=`${total?Math.round(lost/total*100):0} % de avisos recibidos`;
  $('#donutTotal').textContent=total;$('#donutSold').textContent=sold;$('#donutLost').textContent=lost;$('#donutNew').textContent=fresh;
  const soldPct=total?sold/total*100:0,lostPct=total?lost/total*100:0;
  $('.donut').style.background=`conic-gradient(var(--accent) 0 ${soldPct}%,#efbb65 ${soldPct}% ${soldPct+lostPct}%,#dfe3eb ${soldPct+lostPct}% 100%)`;
  const days=[1,2,3,4,5,6,0].map(day=>{const g=rows.filter(n=>new Date(dateOnly(n.received_at)+'T12:00:00').getDay()===day);return[g.length,g.filter(n=>n.status==='Sale').length,g.filter(n=>n.status==='No sale').length];});
  const max=Math.max(1,...days.flat());
  $$('.bar-group').forEach((g,i)=>$$('.bar',g).forEach((b,j)=>b.style.height=`${days[i]?.[j]/max*100||0}%`));
  updateLandingBadge();
  $$('[data-status-id]',body).forEach(sel=>sel.addEventListener('change',e=>handleNoticeStatusChange(e.target.dataset.statusId,e.target.value,e.target)));
  $$('[data-open-id]',body).forEach(b=>b.addEventListener('click',()=>showDetails(b.dataset.openId)));
  $$('[data-edit-id]',body).forEach(b=>b.addEventListener('click',()=>editNotice(b.dataset.editId)));
  $$('[data-delete-id]',body).forEach(b=>b.addEventListener('click',()=>deleteNotice(b.dataset.deleteId)));
  renderReport();
}
function renderComplaints() {
  const body=$('#complaintRows');if(!body)return;
  const rows=notices.filter(n=>n.notice_type==='reclamacion'||n.notice_type==='anulacion').sort((a,b)=>new Date(b.received_at)-new Date(a.received_at));
  $('#complaintCount').textContent=`${rows.length} ${rows.length===1?'registro':'registros'}`;
  $('#complaintEmpty').hidden=rows.length>0;
  body.innerHTML=rows.map(n=>`<tr><td>${esc(formatDate(n.received_at))}</td><td><div class="client-cell"><span class="client-initial">${esc((n.customer_name||'??').slice(0,2).toUpperCase())}</span><div><strong>${esc(n.customer_name||'Sin nombre')}</strong><small>${esc(n.locality||'')}</small></div></div></td><td>${esc(n.phone||'—')}</td><td><span class="source">${n.notice_type==='anulacion'?'Anulación':'Reclamación'}</span></td><td class="complaint-detail">${esc(n.issue||'—')}</td><td>${n.status==='Sale'?'Envío solicitado':n.status==='No sale'?'No es nuestra (cliente equivocado)':'Registro anterior'}</td><td><div class="notice-row-actions"><button class="row-action" data-complaint-detail="${esc(n.id)}" aria-label="Ver datos" title="Ver datos">···</button>${isSuperAdmin&&n.notice_type==='reclamacion'?`<button class="row-action notice-delete" data-delete-complaint="${esc(n.id)}" aria-label="Eliminar reclamación" title="Eliminar reclamación">×</button>`:''}</div></td></tr>`).join('');
  $$('[data-complaint-detail]',body).forEach(button=>button.onclick=()=>showDetails(button.dataset.complaintDetail));
  $$('[data-delete-complaint]',body).forEach(button=>button.onclick=()=>deleteComplaint(button.dataset.deleteComplaint));
}
async function deleteComplaint(id){
  if(!isSuperAdmin)return false;
  const complaint=notices.find(item=>item.id===id&&item.notice_type==='reclamacion');if(!complaint)return false;
  const name=complaint.customer_name||'esta reclamación';
  if(!await confirmDialog('Se eliminará definitivamente la reclamación de '+name+'. Esta acción no se puede deshacer.'))return false;
  const {data,error}=await db.from('notices').delete().eq('id',id).eq('notice_type','reclamacion').select('id');
  if(error){toast(errorText(error),'No se pudo eliminar');return false;}
  if(!data?.length){toast('No se encontró la reclamación o tu sesión no tiene permiso.','No se pudo eliminar');return false;}
  notices=notices.filter(item=>item.id!==id);
  renderComplaints();renderClientHistory();
  toast('La reclamación se ha eliminado definitivamente.','Reclamación eliminada');
  return true;
}
function historyCustomerKey(row) {
  const phone=normalizePhoneForMatch(row.phone);
  if(phone.length>=9)return 'phone:'+phone;
  const name=String(row.customer_name||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  return name?'name:'+name:'record:'+row.id;
}
function clientHistoryGroups() {
  const byId=new Map(notices.map(n=>[n.id,n])),groups=new Map();
  for(const row of notices){
    const parent=row.related_notice_id?byId.get(row.related_notice_id):null;
    const base=parent||row,key=historyCustomerKey(base);
    if(!groups.has(key))groups.set(key,{key,name:base.customer_name||row.customer_name||'Sin nombre',phone:base.phone||row.phone||'',records:[],searchText:'',latest:row.received_at});
    const group=groups.get(key);
    for(const item of [base,row])if(item&&!group.records.some(existing=>existing.id===item.id))group.records.push(item);
    group.name=base.customer_name||group.name;
    if(!group.phone)group.phone=row.phone||'';
    if(new Date(row.received_at)>new Date(group.latest))group.latest=row.received_at;
  }
  for(const group of groups.values()){
    group.records.sort((a,b)=>new Date(b.received_at)-new Date(a.received_at));
    group.searchText=group.records.map(n=>[n.customer_name,n.phone,n.email,n.locality].join(' ')).join(' ').toLowerCase();
    group.searchPhones=group.records.map(n=>normalizePhoneForMatch(n.phone)).filter(p=>p.length>=9);
  }
  return [...groups.values()].sort((a,b)=>new Date(b.latest)-new Date(a.latest));
}
function historyRecordStatus(row) {
  if(row.notice_type==='aviso')return statusLabel(row.status||'Nuevo');
  return row.status==='Sale'?'Envío solicitado':row.status==='No sale'?'No es nuestra (cliente equivocado)':'Pendiente';
}
function historyRecordType(row) {
  if(row.notice_type==='anulacion')return 'Anulación';
  if(row.notice_type==='reclamacion')return 'Reclamación';
  return 'Aviso técnico';
}
function renderClientHistory() {
  const results=$('#historyResults');if(!results)return;
  const input=$('#historySearch'),query=(input?.value||'').trim(),needle=query.toLowerCase(),digits=normalizePhoneForMatch(query);
  const groups=clientHistoryGroups();
  if(query.length<2){selectedHistoryKey=null;results.innerHTML='<div class="empty">Introduce un teléfono o nombre para buscar.</div>';renderClientHistoryDetail(groups);return;}
  const matches=groups.filter(group=>group.searchText.includes(needle)||(digits.length>=2&&group.searchPhones.some(phone=>phone.includes(digits))));
  if(!matches.length){selectedHistoryKey=null;results.innerHTML='<div class="empty">No encontramos un cliente con esos datos.</div>';renderClientHistoryDetail(groups);return;}
  if(!matches.some(group=>group.key===selectedHistoryKey))selectedHistoryKey=matches.length===1?matches[0].key:null;
  results.innerHTML=matches.map(group=>{
    const avisos=group.records.filter(n=>n.notice_type==='aviso').length,reclamaciones=group.records.filter(n=>n.notice_type==='reclamacion').length,anulaciones=group.records.filter(n=>n.notice_type==='anulacion').length;
    return `<button type="button" class="history-result ${group.key===selectedHistoryKey?'active':''}" data-history-client="${esc(group.key)}"><span class="history-result-name">${esc(group.name)}</span><span class="history-result-phone">${esc(group.phone||'Sin teléfono')}</span><span class="history-result-counts"><span class="history-pill-notices">${avisos} avisos</span><span class="history-pill-complaints">${reclamaciones} reclamaciones</span><span>${anulaciones} anulaciones</span></span></button>`;
  }).join('');
  $$('[data-history-client]',results).forEach(button=>button.addEventListener('click',()=>{selectedHistoryKey=button.dataset.historyClient;renderClientHistory();}));
  renderClientHistoryDetail(matches);
}
function renderClientHistoryDetail(availableGroups=clientHistoryGroups()) {
  const host=$('#historyDetail');if(!host)return;
  const group=availableGroups.find(item=>item.key===selectedHistoryKey);
  if(!group){host.innerHTML='<article class="card empty">Selecciona un cliente para ver su historial.</article>';return;}
  const records=group.records,roots=records.filter(n=>n.notice_type==='aviso').sort((a,b)=>new Date(b.received_at)-new Date(a.received_at)),rootIds=new Set(roots.map(n=>n.id));
  const followups=records.filter(n=>n.notice_type==='reclamacion'||n.notice_type==='anulacion'),linked=followups.filter(n=>rootIds.has(n.related_notice_id)),unlinked=followups.filter(n=>!rootIds.has(n.related_notice_id));
  const counts=`${roots.length} ${roots.length===1?'aviso':'avisos'} · ${followups.filter(n=>n.notice_type==='reclamacion').length} ${followups.filter(n=>n.notice_type==='reclamacion').length===1?'reclamación':'reclamaciones'} · ${followups.filter(n=>n.notice_type==='anulacion').length} ${followups.filter(n=>n.notice_type==='anulacion').length===1?'anulación':'anulaciones'}`;
  const followupMarkup=row=>`<div class="history-followup-entry"><div class="history-record-head"><div><strong>${historyRecordType(row)} · ${esc(historyRecordStatus(row))}</strong><small>${esc(formatDate(row.received_at))}</small></div><button type="button" class="history-open-record" data-history-open="${esc(row.id)}">Ver ficha</button></div><p>${esc(row.issue||'Sin detalle indicado')}</p></div>`;
  const noticeCards=roots.map(row=>{
    const source=row.created_by?'Llamada telefónica':landingName(row.landing_id),children=linked.filter(child=>child.related_notice_id===row.id).sort((a,b)=>new Date(b.received_at)-new Date(a.received_at));
    const details=[row.device&&`<span><b>Aparato:</b> ${esc(row.device)}</span>`,row.locality&&`<span><b>Localidad:</b> ${esc(row.locality)}</span>`,row.brand&&`<span><b>Marca:</b> ${esc(row.brand)}</span>`,row.issue&&`<span><b>Detalle:</b> ${esc(row.issue)}</span>`].filter(Boolean).join('');
    return `<article class="card history-record-card"><div class="history-record-head"><div><strong>Aviso técnico · ${esc(row.device||'Aparato sin indicar')}</strong><small>${esc(formatDate(row.received_at))} · ${esc(source)}</small></div><button type="button" class="history-open-record" data-history-open="${esc(row.id)}">Ver ficha</button></div><div class="history-record-meta"><span class="history-pill">${esc(historyRecordStatus(row))}</span><span class="history-pill">${esc(row.category||'Categoría sin indicar')}</span>${row.unit_price>0?`<span class="history-pill">${money(row.unit_price)}</span>`:''}</div><div class="history-record-details">${details||'<span>Sin datos adicionales del aviso.</span>'}</div><div class="history-followups"><h3>Reclamaciones y anulaciones vinculadas (${children.length})</h3>${children.length?children.map(followupMarkup).join(''):'<div class="history-empty-inline">Este aviso todavía no tiene reclamaciones ni anulaciones vinculadas.</div>'}</div></article>`;
  }).join('');
  host.innerHTML=`<article class="card history-summary"><h2>${esc(group.name)}</h2><p>${esc(group.phone||'Sin teléfono')} · Historial completo de esta empresa</p><div class="history-summary-counts"><span class="history-pill history-pill-notices">${counts}</span><span class="history-pill">${records.length} registros en total</span></div></article>${noticeCards||'<article class="card empty">Este cliente todavía no tiene avisos técnicos registrados.</article>'}${unlinked.length?`<article class="history-unlinked"><h3>Reclamaciones o anulaciones sin aviso vinculado (${unlinked.length})</h3><p style="margin:0 0 7px;color:#7d6b48;font-size:10px">Estos registros se buscaron por el teléfono, pero no se vinculó un aviso concreto al registrarlos.</p>${unlinked.sort((a,b)=>new Date(b.received_at)-new Date(a.received_at)).map(followupMarkup).join('')}</article>`:''}`;
  $$('[data-history-open]',host).forEach(button=>button.addEventListener('click',()=>showDetails(button.dataset.historyOpen)));
}
async function changeStatus(id,status,managementReason=null) {
  if(!canManageCurrentNotices())return false;
  const n=notices.find(x=>x.id===id);if(!n)return false;
  const wasSale=n.status==='Sale';
  const tariff=tariffForNotice(n);
  const patch={status,managed_at:status==='Nuevo'?null:new Date().toISOString(),unit_price:status==='Sale'?Number(tariff?.price||0):0,management_reason:status==='No sale'?managementReason:null};
  const {data,error}=await db.from('notices').update(patch).eq('id',id).select().single();
  if(error){toast(errorText(error),'No se pudo guardar');renderRows();return false;}
  Object.assign(n,data);renderRows();renderComplaints();renderClientHistory();
  if(!wasSale&&status==='Sale'&&n.created_by&&!n.landing_id&&n.notice_type==='aviso')await sendNoticeToConfiguredIntegrations(n);
  return true;
}
async function requestNoSaleReason(current='') {
  while(true){
    const values=await formDialog({title:'¿Por qué no ha salido?',description:'Indica el motivo para dejar constancia en el aviso.',fields:[{key:'reason',label:'Motivo',type:'textarea',value:current,required:true,placeholder:'Ej.: cliente no acepta el presupuesto'}],confirmText:'Guardar motivo'});
    if(values===null)return null;
    const reason=String(values.reason||'').trim();
    if(reason)return reason;
    toast('Escribe el motivo antes de continuar.','Falta el motivo');
  }
}
async function handleNoticeStatusChange(id,status,select){
  const notice=notices.find(item=>item.id===id);if(!notice)return;
  let reason=null;
  if(status==='No sale'){
    reason=await requestNoSaleReason(notice.management_reason||'');
    if(reason===null){if(select)select.value=notice.status||'Nuevo';else renderRows();return;}
  }
  const saved=await changeStatus(id,status,reason);
  if(!saved){if(select)select.value=notice.status||'Nuevo';else renderRows();}
}
async function deleteNotice(id){
  if(!isSuperAdmin)return false;
  const notice=notices.find(item=>item.id===id);if(!notice)return false;
  const name=notice.customer_name||'este aviso';
  if(!await confirmDialog('Se eliminará definitivamente el aviso de '+name+'. Esta acción no se puede deshacer.'))return false;
  const {data,error}=await db.from('notices').delete().eq('id',id).select('id');
  if(error){toast(errorText(error),'No se pudo eliminar');return false;}
  if(!data?.length){toast('No se encontró el aviso o tu sesión no tiene permiso.','No se pudo eliminar');return false;}
  notices=notices.filter(item=>item.id!==id);
  renderRows();renderComplaints();renderClientHistory();
  toast('El aviso se ha eliminado definitivamente.','Aviso eliminado');
  return true;
}
async function editNotice(id){
  if(!canManageCurrentNotices())return false;
  const notice=notices.find(item=>item.id===id);if(!notice)return false;
  const base=[
    {key:'customer_name',label:'Cliente',value:notice.customer_name||'',required:true},
    {key:'phone',label:'Teléfono',type:'tel',value:notice.phone||'',required:true},
    {key:'email',label:'Correo',type:'email',value:notice.email||''},
    {key:'locality',label:'Localidad',value:notice.locality||''},
    {key:'postal_code',label:'Código postal',value:notice.postal_code||''},
    {key:'device',label:'Aparato',value:notice.device||''},
    {key:'brand',label:'Marca',value:notice.brand||''},
    {key:'issue',label:'Avería / detalle',type:'textarea',value:notice.issue||''},
    {key:'management_reason',label:'Motivo de no sacado',type:'textarea',value:notice.management_reason||'',required:notice.status==='No sale'}
  ];
  const baseKeys=new Set(base.map(field=>field.key));
  const definitions=(notice.created_by?fieldsForPhone():fieldsForLanding(notice.landing_id)).filter(field=>!baseKeys.has(field.field_key));
  const definedKeys=new Set(definitions.map(field=>field.field_key));
  const extra=[...definitions.map(field=>({key:field.field_key,label:field.label,value:notice.custom_fields?.[field.field_key]??notice[field.field_key]??'',type:({text:'text',phone:'tel',email:'email',number:'number',date:'date',select:'select',textarea:'textarea',checkbox:'checkbox'})[field.field_type]||'text',options:field.options||[]})),...Object.entries(notice.custom_fields||{}).filter(([key])=>!baseKeys.has(key)&&!definedKeys.has(key)).map(([key,value])=>({key,label:key,value,type:'text'}))];
  const values=await formDialog({title:'Editar aviso',description:'Corrige o completa los datos recibidos.',fields:[...base,...extra],confirmText:'Guardar cambios'});
  if(values===null)return false;
  const patch={},custom={...(notice.custom_fields||{})};
  for(const field of base){
    const value=String(values[field.key]??'').trim();
    patch[field.key]=value||null;
    if(field.key!=='management_reason')custom[field.key]=value;
  }
  for(const field of extra)custom[field.key]=values[field.key]??'';
  patch.management_reason=notice.status==='No sale'?String(values.management_reason||'').trim()||null:null;
  patch.custom_fields=custom;
  const {data,error}=await db.from('notices').update(patch).eq('id',id).select().single();
  if(error){toast(errorText(error),'No se pudo guardar');return false;}
  Object.assign(notice,data);renderRows();renderComplaints();renderClientHistory();
  toast('Los datos del aviso se han actualizado.','Aviso actualizado');
  return true;
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
  const resultLabel=n.notice_type==='aviso'?statusLabel(n.status):n.status==='Sale'?'Envío solicitado':n.status==='No sale'?'No es nuestra (cliente equivocado)':'Registro anterior';
  infoDialog('Detalle del registro',`Tipo: ${typeLabel}\nCliente: ${n.customer_name}\nTeléfono: ${n.phone}\nCorreo: ${n.email||'—'}\nAparato: ${n.device||'—'}\nOrigen: ${sourceLabel}\nResultado: ${resultLabel}\nRecibido: ${formatDate(n.received_at)}\nLocalidad: ${n.locality||'—'}\nCódigo postal: ${n.postal_code||'—'}\nMarca: ${n.brand||'—'}\nDetalle: ${n.issue||'—'}\nMotivo por el que no salió: ${n.status==='No sale'?(n.management_reason||'Motivo no indicado'):'—'}\n${custom}`);
}
function installPendingUi() {
  if(!$('#pendingUiStyles')) {
    const style=document.createElement('style');style.id='pendingUiStyles';
    style.textContent='.notice-row-actions{display:flex;align-items:center;gap:5px;white-space:nowrap}.notice-row-actions .row-action{min-width:29px}.notice-row-actions .notice-delete{color:#df2c0b;border-color:#f2c7bd;background:#fff7f5}.notice-row-actions .notice-delete:hover{background:#ffebe6;border-color:#e44820}.pending-status-actions .pending-delete{color:#c6281f;border-color:#f1c0ba;background:#fff7f5}.metric-clickable{cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.metric-pending{background:#fff0e9!important;border-color:#ef9b81!important;box-shadow:inset 4px 0 0 #e44820,0 5px 16px rgba(228,72,32,.09)!important}.metric-clickable:hover{transform:translateY(-2px);border-color:#f3c369;box-shadow:0 10px 26px rgba(28,42,69,.12)}.metric-clickable:focus-visible{outline:3px solid rgba(229,44,13,.35);outline-offset:3px}.pending-modal{width:min(760px,calc(100vw - 28px));max-height:calc(100vh - 36px);overflow:auto}.pending-modal .modal-head{align-items:flex-start}.pending-modal .modal-head p{margin:5px 0 0;color:#7d8798;font-size:12px}.pending-list{display:grid;gap:9px;margin:14px 0}.pending-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;padding:13px 15px;background:#fff;border:1px solid #e5e9f1;border-radius:11px;color:#17243a;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}.pending-item:hover,.pending-item:focus-visible{border-color:#e44820;background:#fffaf8;transform:translateY(-1px);outline:none}.pending-item-main{display:grid;gap:4px;min-width:0}.pending-item-main strong{font-size:13px}.pending-item-main span{font-size:12px;color:#4e5d73}.pending-item-main small{font-size:10px;color:#8490a2}.pending-item-action{display:flex;align-items:center;gap:8px;color:#df2c0b;font-size:12px;font-weight:700;white-space:nowrap}.pending-item-action b{font-size:20px}.pending-hint{margin:12px 0 0;color:#7d8798;font-size:11px}.pending-empty{padding:32px 12px;display:grid;gap:7px;text-align:center;color:#7d8798;font-size:12px}.pending-empty strong{color:#18243a;font-size:16px}.pending-back{border:0;background:none;color:#df2c0b;font-family:inherit;font-size:12px;font-weight:600;padding:0;margin:0 0 14px;cursor:pointer}.pending-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.pending-detail-item{min-width:0;border:1px solid #e7eaf0;border-radius:9px;padding:10px 11px;display:grid;gap:5px;background:#fbfcfe}.pending-detail-item span{font-size:10px;color:#8490a2;text-transform:uppercase;letter-spacing:.04em}.pending-detail-item strong{font-size:13px;color:#202d43;white-space:pre-wrap;overflow-wrap:anywhere}.pending-detail-item.wide{grid-column:1/-1}.pending-status-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px;flex-wrap:wrap}.pending-status-actions button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:560px){.pending-detail-grid{grid-template-columns:1fr}.pending-item{align-items:flex-start;flex-direction:column}.pending-item-action{align-self:flex-end}.pending-status-actions button{flex:1}}';
    document.head.append(style);
  }
  const metric=$('#mNew')?.closest('.metric');
  if(metric) {
    metric.id='pendingMetric';metric.classList.add('metric-clickable');
    metric.setAttribute('role','button');metric.setAttribute('tabindex','0');
    metric.setAttribute('aria-label','Revisar avisos pendientes');
    const foot=$('.metric-foot',metric);if(foot)foot.textContent='Pendientes de gestión · Pulsa para revisar';
  }
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let textNode;
  while((textNode=walker.nextNode()))if(textNode.nodeValue.includes('Aviso Nulo'))textNode.nodeValue=textNode.nodeValue.replaceAll('Aviso Nulo','Aviso no sacado');
}
function pendingNoticeRows() {
  const landingFilter=noticeSource==='landing'?($('#landingFilter')?.value||'all'):'all';
  return notices.filter(n=>n.notice_type==='aviso'&&n.status==='Nuevo'
    &&(noticeSource==='phone'?!!n.created_by:!!n.landing_id)
    &&(landingFilter==='all'||n.landing_id===landingFilter))
    .sort((a,b)=>new Date(b.received_at)-new Date(a.received_at));
}
function pendingDetailRow(label,value,wide) {
  return '<div class="pending-detail-item'+(wide?' wide':'')+'"><span>'+esc(label)+'</span><strong>'+esc(value||'—')+'</strong></div>';
}
function openPendingNotices() {
  const existing=$('.pending-modal-backdrop');if(existing){existing.remove();return;}
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop open pending-modal-backdrop';
  backdrop.style.zIndex='130';
  backdrop.innerHTML='<div class="modal pending-modal" role="dialog" aria-modal="true" aria-labelledby="pendingModalTitle"><div class="modal-head"><div><h2 id="pendingModalTitle">Pendientes de gestión</h2><p>Selecciona un aviso para ver sus datos y marcar el resultado.</p></div><button class="close" type="button" data-pending-close aria-label="Cerrar">×</button></div><div class="pending-content"></div></div>';
  const close=()=>{backdrop.remove();document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape')close();};
  backdrop.addEventListener('click',e=>{if(e.target===backdrop||e.target.closest('[data-pending-close]'))close();});
  document.addEventListener('keydown',onKey);
  document.body.append(backdrop);
  const host=$('.pending-content',backdrop);
  host.addEventListener('click',async e=>{
    const open=e.target.closest('[data-pending-open]');
    if(open){renderPendingNoticeDetail(backdrop,open.getAttribute('data-pending-open'));return;}
    if(e.target.closest('[data-pending-back]')){renderPendingNoticeList(backdrop);return;}
    const id=backdrop.dataset.pendingNoticeId;
    if(e.target.closest('[data-pending-edit]')){await editNotice(id);renderPendingNoticeDetail(backdrop,id);return;}
    if(e.target.closest('[data-pending-delete]')){if(await deleteNotice(id))renderPendingNoticeList(backdrop);return;}
    const action=e.target.closest('[data-pending-status]');
    if(action){
      const status=action.getAttribute('data-pending-status');let reason=null;
      if(status==='No sale'){close();reason=await requestNoSaleReason(notices.find(item=>item.id===id)?.management_reason||'');if(reason===null)return;}
      host.querySelectorAll('button').forEach(button=>button.disabled=true);action.textContent='Guardando…';
      const saved=await changeStatus(id,status,reason);
      if(saved){toast(status==='Sale'?'Aviso marcado como sacado.':'Aviso marcado como no sacado.','Gestión actualizada');if(backdrop.isConnected)renderPendingNoticeList(backdrop);}
      else if(backdrop.isConnected)renderPendingNoticeDetail(backdrop,id);
    }
  });
  renderPendingNoticeList(backdrop);
}
function renderPendingNoticeList(backdrop) {
  const host=$('.pending-content',backdrop);if(!host)return;
  const rows=pendingNoticeRows();
  if(!rows.length) {
    host.innerHTML='<div class="pending-empty"><strong>Todo al día</strong><span>No hay avisos nuevos pendientes en esta vista.</span></div>';
    return;
  }
  host.innerHTML='<div class="pending-list">'+rows.map(n=>{
    const origin=n.created_by?'Teléfono':landingName(n.landing_id);
    const summary=[n.device,n.locality].filter(Boolean).join(' · ')||'Sin aparato ni localidad';
    return '<button type="button" class="pending-item" data-pending-open="'+esc(n.id)+'"><span class="pending-item-main"><strong>'+esc(n.customer_name||'Sin nombre')+'</strong><span>'+esc(summary)+'</span><small>'+esc(origin)+' · '+esc(formatDate(n.received_at))+'</small></span><span class="pending-item-action">Ver datos <b aria-hidden="true">›</b></span></button>';
  }).join('')+'</div><p class="pending-hint">Al elegir un resultado, el aviso saldrá de esta lista de pendientes.</p>';
}
function renderPendingNoticeDetail(backdrop,id) {
  const n=notices.find(item=>item.id===id);if(!n)return;
  const host=$('.pending-content',backdrop);if(!host)return;
  backdrop.dataset.pendingNoticeId=id;
  const origin=n.created_by?'Teléfono':landingName(n.landing_id);
  const extras=Object.entries(n.custom_fields||{}).filter(([key])=>!['customer_name','phone','email','locality','postal_code','device','brand','issue'].includes(key)).map(([key,value])=>pendingDetailRow(fields.find(f=>f.field_key===key)?.label||key,value,false)).join('');
  const canManage=canManageCurrentNotices();
  host.innerHTML='<button type="button" class="pending-back" data-pending-back>‹ Volver a pendientes</button><div class="pending-detail-grid">'
    +pendingDetailRow('Cliente',n.customer_name,false)+pendingDetailRow('Teléfono',n.phone,false)
    +pendingDetailRow('Correo',n.email,false)+pendingDetailRow('Origen',origin,false)
    +pendingDetailRow('Aparato',n.device,false)+pendingDetailRow('Localidad',n.locality,false)
    +pendingDetailRow('Código postal',n.postal_code,false)+pendingDetailRow('Marca',n.brand,false)
    +pendingDetailRow('Recibido',formatDate(n.received_at),false)+pendingDetailRow('Avería',n.issue,true)
    +(n.status==='No sale'?pendingDetailRow('Motivo por el que no salió',n.management_reason||'Motivo no indicado',true):'')+extras
    +'</div><div class="pending-status-actions">'+(canManageCurrentNotices()?'<button type="button" class="outline-btn" data-pending-edit>Editar datos</button>':'')+(isSuperAdmin?'<button type="button" class="outline-btn pending-delete" data-pending-delete>Eliminar aviso</button>':'')+'<button type="button" class="outline-btn" data-pending-status="No sale" '+(canManage?'':'disabled')+'>Aviso no sacado</button><button type="button" class="primary-btn" data-pending-status="Sale" '+(canManage?'':'disabled')+'>Aviso sacado</button></div>'
    +(canManage?'':'<p class="pending-hint">Tu perfil puede consultar los datos, pero no cambiar el estado.</p>');
}
function setupDate(prefix) {
  const report=prefix==='report', select=$('#'+(report?'reportPeriod':'period'));
  const exact=$('#'+(report?'reportExactDateControl':'exactDateControl')), range=$('#'+(report?'reportRangeControls':'rangeDateControls'));
  select.addEventListener('change',()=>{exact.hidden=select.value!=='date';range.hidden=select.value!=='range';report?renderReport():renderRows();});
  (report?['reportExactDate','reportDateFrom','reportDateTo']:['exactDate','dateFrom','dateTo']).forEach(id=>$('#'+id).addEventListener('change',()=>report?renderReport():renderRows()));
}
function getReportRows(){return getReportActivityRows().filter(n=>n.notice_type==='aviso');}
function getReportActivityRows() {
  const period=$('#reportPeriod').value,exact=$('#reportExactDate').value,from=$('#reportDateFrom').value,to=$('#reportDateTo').value;
  const weekday=$('#reportWeekday')?.value||'all',status=$('#reportStatus')?.value||'all',landing=$('#reportLanding')?.value||'all';
  return notices.filter(n=>{
    const d=dateOnly(n.received_at),day=new Date(d+'T12:00:00').getDay();
    return inDatePeriod(d,period,exact,from,to)&&(weekday==='all'||day===Number(weekday))&&(status==='all'||n.status===status)&&(landing==='all'||!n.landing_id||n.landing_id===landing);
  });
}
function renderReport() {
  const rows=getReportRows(),sold=rows.filter(n=>n.status==='Sale'),lost=rows.filter(n=>n.status==='No sale'),managed=sold.length+lost.length;
  const revenue=sold.reduce((a,n)=>a+Number(n.unit_price||0),0);
  const formRows=rows.filter(n=>!!n.landing_id),groups=landings.map(l=>{const g=formRows.filter(n=>n.landing_id===l.id);return{landing:l,total:g.length,sold:g.filter(n=>n.status==='Sale').length,lost:g.filter(n=>n.status==='No sale').length};});
  const best=[...groups].sort((a,b)=>b.sold-a.sold||b.total-a.total)[0];
  const activity=getReportActivityRows(),phoneRows=activity.filter(n=>n.notice_type==='aviso'&&!!n.created_by&&!n.landing_id),complaintRows=activity.filter(n=>n.notice_type==='reclamacion'),cancellationRows=activity.filter(n=>n.notice_type==='anulacion');
  const sourceCard=(title,items,labels,metricLabel)=>{
    const counts=['Nuevo','Sale','No sale'].map(status=>items.filter(n=>n.status===status).length),total=items.length,converted=counts[1]+counts[2],pct=converted?Math.round(counts[1]/converted*100):0;
    return `<div class="report-source-card"><div class="report-source-heading"><strong>${esc(title)}</strong><b>${total}</b></div><div class="report-source-stats">${counts.map((count,i)=>`<div><strong>${count}</strong><span>${esc(labels[i])}</span></div>`).join('')}</div><div class="report-source-percent"><span>${esc(metricLabel)}</span><strong>${pct} %</strong></div></div>`;
  };
  $('#reportConversion').textContent=`${managed?Math.round(sold.length/managed*100):0} %`;
  $('#reportManagedCount').textContent=`${managed} avisos gestionados`;
  $('#reportRevenue').textContent=money(revenue);$('#reportTotal').textContent=rows.length;
  $('#reportBestLanding').textContent=best?.total?best.landing.name:'—';$('#reportBestDetail').textContent=best?.total?`${best.total} avisos · ${best.sold} Avisos Sacados`:'0 avisos sacados';
  $('#reportLandingResults').innerHTML=groups.filter(g=>g.total>0).map(g=>`<div class="placeholder-tile"><strong>${esc(g.landing.name)}</strong><small>${g.total} avisos · ${g.sold} Avisos Sacados · ${g.lost} Avisos Nulos</small></div>`).join('')||'<div class="empty">No hay avisos de formulario en este filtro.</div>';
  $('#reportPhoneResults').innerHTML=sourceCard('Avisos telefónicos',phoneRows,['Pendiente','Aviso Sacado','Aviso no sacado'],'Conversión de gestionados');
  $('#reportComplaintResults').innerHTML=sourceCard('Reclamaciones',complaintRows,['Pendiente','Envío solicitado','Cliente equivocado'],'Envío solicitado')+sourceCard('Anulaciones',cancellationRows,['Pendiente','Envío solicitado','Cliente equivocado'],'Envío solicitado');
  const totals=new Map();sold.forEach(n=>{const origin=n.landing_id?landingName(n.landing_id):`Teléfono · ${n.locality||'Ciudad sin indicar'}`;const k=`${origin} · ${n.category||'Sin categoría'}`,v=totals.get(k)||{amount:0,count:0};v.amount+=Number(n.unit_price||0);v.count++;totals.set(k,v);});
  $('#reportPriceRows').innerHTML=[...totals].sort((a,b)=>b[1].amount-a[1].amount).map(([label,v])=>`<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f0f1f5;padding:8px 0;font-size:11px"><span>${esc(label)} <small>(${v.count})</small></span><strong>${money(v.amount)}</strong></div>`).join('')||'<div class="empty">No hay avisos sacados en este filtro.</div>';
}
function renderPriceRules() {
  const body=$('#priceRows');if(!body)return;
  const cityBody=$('#phonePriceRows');
  const categories=['Gama blanca','Clima'];
  body.innerHTML=landings.map(landing=>categories.map((category,index)=>{
    const tariff=tariffs.find(t=>(t.scope||'landing')==='landing'&&t.landing_id===landing.id&&t.category===category);
    return `<tr>${index===0?`<td rowspan="2">${esc(landing.name)}</td>`:''}<td>${esc(category)}</td><td><input type="number" min="0" step="0.01" value="${Number(tariff?.price||0)}" data-landing-tariff-price="${landing.id}" data-landing-tariff-category="${esc(category)}" aria-label="Precio de ${esc(category)} para ${esc(landing.name)}"/></td></tr>`;
  }).join('')).join('')||'<tr><td colspan="3" class="empty">Todavía no hay landings. Añade una landing para configurar sus tarifas.</td></tr>';
  if(cityBody)cityBody.innerHTML=tariffs.map((t,i)=>t.scope==='phone'?`<tr><td><input type="text" value="${esc(t.locality)}" data-tariff-locality="${i}" aria-label="Ciudad"/></td><td><select data-tariff-phone-category="${i}">${['Gama blanca','Clima'].map(c=>`<option ${c===t.category?'selected':''}>${c}</option>`).join('')}</select></td><td><input type="number" min="0" step="0.01" value="${t.price}" data-tariff-price="${i}"/></td><td><button class="mini-delete" data-tariff-delete="${i}" aria-label="Eliminar tarifa telefónica">×</button></td></tr>`:'').join('')||'<tr><td colspan="4" class="empty">Todavía no hay tarifas por ciudad.</td></tr>';
  $$('[data-landing-tariff-price]').forEach(input=>input.addEventListener('change',e=>updateLandingTariff(e.target.dataset.landingTariffPrice,e.target.dataset.landingTariffCategory,Number(e.target.value||0),e.target)));
  $$('[data-tariff-phone-category]').forEach(x=>x.addEventListener('change',e=>updateTariff(+e.target.dataset.tariffPhoneCategory,{category:e.target.value})));
  $$('[data-tariff-locality]').forEach(x=>x.addEventListener('change',e=>updateTariff(+e.target.dataset.tariffLocality,{locality:e.target.value.trim()})));
  $$('[data-tariff-price]').forEach(x=>x.addEventListener('change',e=>updateTariff(+e.target.dataset.tariffPrice,{price:Number(e.target.value||0)})));
  $$('[data-tariff-delete]').forEach(x=>x.addEventListener('click',async e=>{const t=tariffs[+e.target.dataset.tariffDelete];if(!await confirmDialog('¿Eliminar esta tarifa?'))return;const {error}=await db.from('tariffs').delete().eq('id',t.id);if(error)toast(errorText(error),'Error');else{tariffs=tariffs.filter(x=>x.id!==t.id);renderPriceRules();renderRows();}}));
}
async function updateLandingTariff(landingId,category,price,input) {
  const landing=landings.find(item=>item.id===landingId);
  if(!landing||!Number.isFinite(price)||price<0){renderPriceRules();return;}
  const existing=tariffs.find(t=>(t.scope||'landing')==='landing'&&t.landing_id===landingId&&t.category===category);
  if(existing&&Number(existing.price)===price)return;
  if(input)input.disabled=true;
  const values={price,updated_at:new Date().toISOString()};
  const result=existing
    ? await db.from('tariffs').update(values).eq('id',existing.id).select().single()
    : await db.from('tariffs').insert({company_id:currentCompany.id,scope:'landing',landing_id:landingId,locality:null,category,price}).select().single();
  if(result.error){toast(errorText(result.error),'Tarifa no guardada');renderPriceRules();if(input)input.disabled=false;return;}
  const index=existing?tariffs.findIndex(t=>t.id===existing.id):-1;
  if(index>=0)tariffs[index]=result.data;else tariffs.push(result.data);
  renderRows();renderReport();
  if(input)input.disabled=false;
}
async function updateTariff(i,changes) {
  const t=tariffs[i];if(!t)return;
  const merged={...t,...changes,company_id:currentCompany.id,updated_at:new Date().toISOString()};
  if(merged.scope==='phone'){merged.locality=String(merged.locality||'').trim();if(!merged.locality){toast('Indica la ciudad para esta tarifa.','Falta la ciudad');renderPriceRules();return;}}
  const duplicate=tariffs.find((other,index)=>index!==i&&other.category===merged.category&&((merged.scope==='phone'&&other.scope==='phone'&&normalizeLocality(other.locality)===normalizeLocality(merged.locality))||((other.scope||'landing')==='landing'&&(merged.scope||'landing')==='landing'&&other.landing_id===merged.landing_id)));
  if(duplicate){toast(merged.scope==='phone'?'Ya existe una tarifa para esa ciudad y categoría.':'Ya existe una tarifa para esa landing y categoría.','Tarifa duplicada');renderPriceRules();return;}
  const {data,error}=await db.from('tariffs').update(merged).eq('id',t.id).select().single();
  if(error){toast(errorText(error),'Tarifa no guardada');return;}
  tariffs[i]=data;renderRows();renderReport();
}
async function addPhoneTariff() {
  const answer=await formDialog({title:'Añadir tarifa telefónica',description:'Indica la ciudad y el precio para cada categoría. La llamada debe incluir esa misma ciudad.',fields:[{key:'locality',label:'Ciudad o municipio',required:true},{key:'category',label:'Categoría',type:'select',value:'Gama blanca',options:['Gama blanca','Clima']},{key:'price',label:'Precio por aviso',type:'number',value:0,required:true}]});
  if(!answer)return;
  const locality=answer.locality.trim();
  if(!locality){toast('Escribe una ciudad o municipio.','Falta la ciudad');return;}
  if(tariffs.some(t=>t.scope==='phone'&&t.category===answer.category&&normalizeLocality(t.locality)===normalizeLocality(locality))){toast('Ya existe una tarifa para esa ciudad y categoría.','Tarifa duplicada');return;}
  const {data,error}=await db.from('tariffs').insert({company_id:currentCompany.id,scope:'phone',landing_id:null,locality,category:answer.category,price:Math.max(0,Number(answer.price)||0)}).select().single();
  if(error){toast(errorText(error),'No se pudo crear la tarifa telefónica');return;}
  tariffs.push(data);renderPriceRules();renderReport();
}
async function renderFields() {
  const list=$('#fieldList');if(!list)return;
  const selectedLanding=fieldScope==='landing'?($('#fieldLandingFilter')?.value||''):null;
  fieldEditorRows=fields.filter(f=>f.channel===fieldScope&&(fieldScope==='phone'?!f.landing_id:(selectedLanding?f.landing_id===selectedLanding:!f.landing_id))).sort((a,b)=>(a.position||0)-(b.position||0));
  const title=$('#fieldEditorTitle');if(title)title.textContent=fieldScope==='phone'?'Campos de llamadas telefónicas':'Campos de aviso por landing';
  const description=$('#fieldEditorDescription');if(description)description.textContent=fieldScope==='phone'?'Estos campos se comparten entre avisos, reclamaciones y anulaciones por teléfono. «Obligatorio» exige el dato; «Ver en tabla» lo muestra en la lista; «Ver en tarjetas» lo muestra en el tablero; «Mostrar al registrar llamada» lo incluye en el formulario telefónico. Arrastra las tarjetas para cambiar el orden.':'Los campos generales se aplican a todas las landing. «Obligatorio» exige el dato; «Ver en tabla» y «Ver en tarjetas» deciden dónde aparece en el CRM; «Incluir en formulario web» lo añade al formulario. Selecciona una landing para configurar sus campos específicos. Arrastra las tarjetas para cambiar el orden.';
  const landingWrap=$('#landingFieldControls');if(landingWrap)landingWrap.hidden=fieldScope==='phone';
  const typeNames={text:'Texto',phone:'Teléfono',email:'Correo',number:'Número',date:'Fecha',select:'Lista',textarea:'Texto largo',checkbox:'Casilla'};
  const formColumnLabel=fieldScope==='phone'?'Mostrar en el formulario de llamada':'Incluir en el formulario web';
  list.innerHTML=fieldEditorRows.map((f,i)=>`<div class="field-config-card" draggable="true" data-field-card="${i}" aria-label="Arrastra para cambiar el orden de ${esc(f.label)}"><div class="field-config-main"><input data-field-label="${i}" aria-label="Nombre del campo" value="${esc(f.label)}"/><select data-field-type="${i}" aria-label="Tipo de campo">${Object.entries(typeNames).map(([key,label])=>`<option value="${key}" ${f.field_type===key?'selected':''}>${label}</option>`).join('')}</select><button type="button" class="mini-delete" data-field-delete="${i}" aria-label="Eliminar campo">×</button><small>${fieldScope==='phone'?'Todas las llamadas':f.landing_id?esc(landingName(f.landing_id)):'Todas las landings'}</small></div><div class="field-config-options"><div class="field-option-set"><strong>Requisito</strong><label title="La persona tendrá que rellenar este dato"><input type="checkbox" data-field-required="${i}" ${f.required?'checked':''}/> Obligatorio</label></div><div class="field-option-set"><strong>Mostrar en el CRM</strong><label title="Mostrar este dato como columna en la tabla de avisos"><input type="checkbox" data-field-table="${i}" ${f.visible_in_table?'checked':''}/> En tabla</label><label title="Mostrar este dato en las tarjetas del tablero"><input type="checkbox" data-field-card-config="${i}" ${f.visible_on_card?'checked':''} ${f.field_key==='customer_name'?'disabled':''}/> En tarjetas</label></div><div class="field-option-set"><strong>${fieldScope==='phone'?'Formulario de llamada':'Formulario web'}</strong><label title="${fieldScope==='phone'?'Mostrar al registrar avisos, reclamaciones o anulaciones':'Incluir este campo en el formulario de la landing'}"><input type="checkbox" data-field-form="${i}" ${f.visible_in_form?'checked':''}/> ${formColumnLabel}</label></div></div></div>`).join('')||'<div class="empty">No hay campos exclusivos en esta selección. Los campos generales se mantienen si has seleccionado una landing.</div>';
  $$('[data-field-label]').forEach(x=>x.addEventListener('change',async e=>{const i=+e.target.dataset.fieldLabel,label=e.target.value.trim();if(!label){e.target.value=fieldEditorRows[i].label;return;}await saveField(i,{label});}));
  $$('[data-field-type]').forEach(x=>x.addEventListener('change',async e=>{const i=+e.target.dataset.fieldType,field_type=e.target.value;let options=fieldEditorRows[i].options||[];if(field_type==='select'){const answer=await formDialog({title:'Opciones del campo',description:'Escribe las opciones separadas por comas.',fields:[{key:'options',label:'Opciones',type:'text',value:options.join(', '),required:true}]});if(!answer){renderFields();return;}options=answer.options.split(',').map(v=>v.trim()).filter(Boolean);}await saveField(i,{field_type,options});}));
  $$('[data-field-required]').forEach(x=>x.addEventListener('change',e=>saveField(+e.target.dataset.fieldRequired,{required:e.target.checked})));
  $$('[data-field-table]').forEach(x=>x.addEventListener('change',e=>saveField(+e.target.dataset.fieldTable,{visible_in_table:e.target.checked})));
  $$('[data-field-card-config]').forEach(x=>x.addEventListener('change',e=>saveField(+e.target.dataset.fieldCardConfig,{visible_on_card:e.target.checked})));
  $$('[data-field-form]').forEach(x=>x.addEventListener('change',e=>saveField(+e.target.dataset.fieldForm,{visible_in_form:e.target.checked})));
  $$('[data-field-card]',list).forEach(card=>{
    card.addEventListener('dragstart',event=>{
      fieldDragSource=Number(card.dataset.fieldCard);
      card.classList.add('dragging');
      if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(fieldDragSource));}
    });
    card.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';card.classList.add('drag-over');});
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',async event=>{
      event.preventDefault();card.classList.remove('drag-over');
      const source=Number.isInteger(fieldDragSource)?fieldDragSource:Number(event.dataTransfer?.getData('text/plain'));
      const target=Number(card.dataset.fieldCard);fieldDragSource=null;
      if(Number.isInteger(source)&&source>=0&&source!==target)await moveFieldTo(source,target);
    });
    card.addEventListener('dragend',()=>{fieldDragSource=null;card.classList.remove('dragging');$$('[data-field-card].drag-over',list).forEach(el=>el.classList.remove('drag-over'));});
  });
  $$('[data-field-delete]').forEach(x=>x.addEventListener('click',async e=>{const f=fieldEditorRows[+e.target.dataset.fieldDelete];if(!await confirmDialog(`¿Eliminar el campo «${f.label}» de futuras entradas?`))return;const {error}=await db.from('notice_fields').delete().eq('id',f.id);if(error)toast(errorText(error),'Error');else{fields=fields.filter(x=>x.id!==f.id);renderFields();renderRows();renderExtraFields();}}));
}
async function moveFieldTo(sourceIndex,targetIndex) {
  if(sourceIndex<0||targetIndex<0||sourceIndex>=fieldEditorRows.length||targetIndex>=fieldEditorRows.length||sourceIndex===targetIndex)return;
  const ordered=[...fieldEditorRows],moved=ordered.splice(sourceIndex,1)[0];
  ordered.splice(targetIndex,0,moved);
  const results=await Promise.all(ordered.map((field,position)=>db.from('notice_fields').update({position:position+1}).eq('id',field.id)));
  const failed=results.find(result=>result.error);
  if(failed){toast(errorText(failed.error),'No se pudo guardar el orden');renderFields();return;}
  ordered.forEach((field,position)=>{field.position=position+1;});
  renderFields();renderRows();renderExtraFields();
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
  $('[data-custom-key]').forEach(node=>node.remove());
  host.innerHTML=fieldsForPhone().filter(f=>f.visible_in_form&&!['customer_name','phone','locality','postal_code','device','brand','issue'].includes(f.field_key)).map(f=>{
    const inputType={text:'text',phone:'tel',email:'email',number:'number',date:'date',select:'select',textarea:'textarea',checkbox:'checkbox'}[f.field_type]||'text';
    let field=inputType==='select'?'<select '+(f.required?'required':'')+'>'+['',...(f.options||[])].map(v=>`<option>${esc(v)}</option>`).join('')+'</select>':inputType==='textarea'?'<textarea '+(f.required?'required':'')+'></textarea>':`<input type="${inputType}" ${f.required?'required':''} ${inputType==='checkbox'?'value="true"':''}/>`;
    return `<label class="field custom-field-value" data-custom-key="${esc(f.field_key)}"><span>${esc(f.label)}</span>${field}</label>`;
  }).join('');
  const grid=$('#noticeFieldsGrid');if(!grid)return;
  const domKeys={name:'customer_name',phone:'phone',locality:'locality',postal:'postal_code'};
  const nodes=new Map();
  $('[data-field-code]',grid).forEach(node=>nodes.set(domKeys[node.dataset.fieldCode]||node.dataset.fieldCode,node));
  $('[data-custom-key]',host).forEach(node=>nodes.set(node.dataset.customKey,node));
  fieldsForPhone().forEach(field=>{const node=nodes.get(field.field_key);if(node)grid.append(node);});
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
  $('#recordTypeWrap').hidden=noticeSource!=='phone'||!nonNotice;
  $('#statusFieldWrap').hidden=noticeSource!=='phone';
  const status=$('#fStatus'),statusLabel=$('#fStatusLabel');
  if(status&&statusLabel&&nonNotice){
    const previous=status.value;
    statusLabel.textContent='Resultado de la llamada';
    status.innerHTML='<option value="Sale">Enviar reclamación o anulación</option><option value="No sale">No es nuestra (cliente equivocado)</option>';
    status.value=previous==='Sale'||previous==='No sale'?previous:(relatedNoticeMatch?'Sale':'No sale');
  } else if(status&&statusLabel){
    statusLabel.textContent='Resultado del aviso';
    status.innerHTML='<option value="Nuevo">Pendiente</option><option value="Sale">Aviso Sacado</option><option value="No sale">Aviso no sacado</option>';
    status.value='Nuevo';
  }
  const deviceField=$('[data-field-code="device"]'),brandField=$('[data-field-code="brand"]'),issueField=$('[data-field-code="issue"]');
  if(deviceField&&nonNotice)deviceField.hidden=true;
  if(brandField&&nonNotice)brandField.hidden=true;
  if(issueField&&nonNotice)issueField.hidden=false;
  const issueLabel=$('#fIssueLabel'),issue=$('#fIssue');
  const configuredIssueLabel=fieldsForPhone().find(f=>f.field_key==='issue')?.label;
  const customIssueLabel=configuredIssueLabel&&configuredIssueLabel!=='Avería o comentario';
  if(issueLabel)issueLabel.textContent=customIssueLabel?configuredIssueLabel:type==='anulacion'?'Detalle de la anulación':type==='reclamacion'?'Motivo de la reclamación':'Avería o comentario';
  if(issue) {issue.placeholder=nonNotice?(type==='anulacion'?'Describe qué servicio, cita o solicitud se quiere anular':'Describe exactamente qué reclama el cliente'):'Describe brevemente el problema';issue.required=nonNotice;}
  $('#modalTitle').textContent=type==='anulacion'?'Registrar anulación':type==='reclamacion'?'Registrar reclamación':'Añadir aviso';
  $('#modalDescription').textContent=nonNotice?'Completa los datos de la persona y el detalle de la reclamación o anulación.':'Completa los datos para registrar un aviso telefónico.';
  updateRecordSubmitLabel();
}
function updateRecordSubmitLabel() {
  const type=$('#fRecordType')?.value||'aviso',status=$('#fStatus')?.value,submit=$('#saveNotice'),agendaSubmit=$('#saveAndSchedule');
  if(submit)submit.textContent=type==='aviso'?'Guardar aviso':status==='Sale'?(type==='anulacion'?'Enviar anulación':'Enviar reclamación'):'Registrar cliente equivocado';
  if(agendaSubmit){agendaSubmit.hidden=noticeSource!=='phone'||type!=='aviso';agendaSubmit.disabled=status!=='Sale';agendaSubmit.title=status==='Sale'?'Guardar el aviso y abrir la agenda':'Para agendar, marca primero el aviso como sacado';}
}
function normalizePhoneForMatch(value) {
  let digits=String(value||'').replace(/\D/g,'');
  if(digits.startsWith('0034'))digits=digits.slice(4);else if(digits.startsWith('34')&&digits.length>9)digits=digits.slice(2);
  return digits.length>=9?digits.slice(-9):digits;
}
function findPreviousNoticesByPhone(value) {
  const phone=normalizePhoneForMatch(value);if(phone.length<9)return [];
  return notices.filter(n=>n.notice_type==='aviso'&&n.status==='Sale'&&normalizePhoneForMatch(n.phone)===phone)
    .sort((a,b)=>new Date(b.received_at)-new Date(a.received_at));
}
async function openPhoneNotice(type='aviso', preselectedId=null) {
  const preset=preselectedId?notices.find(n=>n.id===preselectedId&&n.notice_type==='aviso'):null;
  let lookupPhone=preset?.phone||'',matched=preset||null;
  if(type!=='aviso'&&!matched) {
    const answer=await formDialog({title:'Buscar aviso anterior',description:'¿Qué número de teléfono facilitó al dar el aviso? Buscaremos un aviso técnico marcado como sacado en esta empresa.',fields:[{key:'phone',label:'Número de teléfono que facilitó al dar el aviso',type:'tel',required:true}],confirmText:'Buscar aviso'});
    if(!answer)return;
    lookupPhone=answer.phone.trim();const previousNotices=findPreviousNoticesByPhone(lookupPhone);
    if(previousNotices.length===1)matched=previousNotices[0];
    else if(previousNotices.length>1){
      const choose=await formDialog({title:'Seleccionar el aviso',description:'Este número tiene varios avisos sacados. Elige cuál quiere reclamar o anular el cliente.',fields:[{key:'notice_id',label:'Aviso relacionado',type:'select',required:true,options:previousNotices.map(n=>({value:n.id,label:`${n.device||n.category||'Aviso técnico'} · ${n.locality||'Localidad sin indicar'} · ${formatDate(n.received_at)} · ${n.landing_id?landingName(n.landing_id):'Teléfono'}`}))}]});
      if(!choose)return;matched=previousNotices.find(n=>n.id===choose.notice_id)||null;
    }
    if(matched)toast(`Encontrado: ${matched.customer_name||'Cliente'} · ${matched.device||matched.category||'Aviso técnico'} · ${formatDate(matched.received_at)}`,'Aviso sacado encontrado');
    else toast('No encontramos un aviso sacado con ese número en esta empresa. Podrás completar los datos y marcar el resultado.','Sin aviso relacionado');
  }
  relatedNoticeMatch=matched;
  noticeSource='phone';$('#noticeForm').reset();
  $('#fRecordType').innerHTML=type==='aviso'?'<option value="aviso">Aviso técnico</option>':'<option value="reclamacion">Reclamación</option><option value="anulacion">Anulación</option>';
  $('#fRecordType').value=type;
  syncDefaultFields();renderExtraFields();updateRecordFormMode();
  if(type!=='aviso') {
    const prior=matched||{};
    $('#fPhone').value=prior.phone||lookupPhone;
    $('#fName').value=prior.customer_name||'';
    $('#fLocality').value=prior.locality||'';
    $('#fPostal').value=prior.postal_code||'';
    const hint=$('#relatedNoticeHint');
    if(hint){hint.hidden=false;hint.className=matched?'notice-match found':'notice-match missing';hint.textContent=matched?`Aviso encontrado: ${matched.device||matched.category||'Aviso técnico'} · ${matched.locality||'Localidad sin indicar'} · ${formatDate(matched.received_at)} · ${matched.landing_id?landingName(matched.landing_id):'Teléfono'}. Datos del cliente completados.`:'No hay un aviso sacado asociado. Comprueba el número y completa los datos manualmente.';}
  } else {const hint=$('#relatedNoticeHint');if(hint)hint.hidden=true;}
  $('#modal').classList.add('open');$('#fName').focus();
}
function showDuplicatePhoneDialog(matches,normalizedPhone,submitAction='saveNotice') {
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop open';
  const highest=[...document.querySelectorAll('.modal-backdrop')].reduce((max,el)=>Math.max(max,Number(el.style.zIndex)||0),100);
  backdrop.style.zIndex=String(highest+20);
  const rows=matches.slice(0,12).map(n=>{
    const device=n.device||n.category||'Aparato sin indicar';
    
    const status=n.status==='Sale'?'Aviso sacado':n.status==='No sale'?'Aviso no sacado':'Nuevo / pendiente';
    return '<article style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border:1px solid #e3e8f1;border-radius:10px;background:#fff"><div style="min-width:0"><strong>'+esc(device)+'</strong><div style="font-size:12px;color:#5d6a7e;margin-top:4px">'+esc(n.issue||'Sin avería indicada')+' · '+esc(formatDate(n.received_at))+'</div><small style="color:#8791a2">'+esc(status)+' · '+esc(n.customer_name||'Sin nombre')+'</small></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="outline-btn" data-duplicate-view="'+esc(n.id)+'">Ver aviso</button>'+'<button type="button" class="primary-btn" data-duplicate-claim="'+esc(n.id)+'">Crear reclamación</button>'+'</div></article>';
  }).join('');
  const extra=matches.length>12?'<p style="font-size:12px;color:#7b8798">Se muestran los 12 avisos más recientes.</p>':'';
  backdrop.innerHTML='<div class="modal" style="width:min(760px,calc(100vw - 28px));max-height:90vh;overflow:auto" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>Cliente repetido</h2><p>Este teléfono ya aparece en '+matches.length+' '+(matches.length===1?'aviso':'avisos')+' de la empresa. Revisa el historial y decide cómo registrarlo.</p></div><button type="button" class="close" data-duplicate-cancel aria-label="Cerrar">×</button></div><div style="display:grid;gap:8px;margin:14px 0">'+rows+'</div>'+extra+'<p style="font-size:12px;color:#68758a">Puedes consultar el aviso anterior o crear una reclamación vinculada. Si se trata de otra avería, también puedes crear un aviso nuevo.</p><div class="modal-actions"><button type="button" class="outline-btn" data-duplicate-cancel>Volver al aviso</button><button type="button" class="primary-btn" data-duplicate-new>Aun así, crear aviso nuevo</button></div></div>';
  const close=()=>backdrop.remove();
  backdrop.addEventListener('click',e=>{if(e.target===backdrop||e.target.closest('[data-duplicate-cancel]'))close();});
  $$('[data-duplicate-view]',backdrop).forEach(button=>button.onclick=()=>showDetails(button.dataset.duplicateView));
  $$('[data-duplicate-claim]',backdrop).forEach(button=>button.onclick=async()=>{const id=button.dataset.duplicateClaim;close();await openPhoneNotice('reclamacion',id);});
  $('[data-duplicate-new]',backdrop).onclick=()=>{close();duplicatePhoneBypass=normalizedPhone;$('#noticeForm').requestSubmit($('#'+submitAction));};
  document.body.append(backdrop);
}
async function createNotice(event) {
  event.preventDefault();
  const type=$('#fRecordType').value||'aviso';
  const saveAndSchedule=event.submitter?.id==='saveAndSchedule';
  if(saveAndSchedule&&(noticeSource!=='phone'||type!=='aviso'||$('#fStatus').value!=='Sale')){toast('Para guardar y agendar, marca primero el aviso como sacado.','Aviso todavía no sacado');return;}
  const phone=$('#fPhone')?.value?.trim()||'';
  const normalizedPhone=normalizePhoneForMatch(phone);
  if(type==='aviso'&&normalizedPhone.length>=9){
    const matches=notices.filter(n=>n.notice_type==='aviso'&&normalizePhoneForMatch(n.phone)===normalizedPhone).sort((a,b)=>new Date(b.received_at)-new Date(a.received_at));
    if(matches.length&&duplicatePhoneBypass!==normalizedPhone){showDuplicatePhoneDialog(matches,normalizedPhone,saveAndSchedule?'saveAndSchedule':'saveNotice');return;}
  }
  duplicatePhoneBypass=null;
  const submitButtons=$$('#noticeForm button[type="submit"]');
  submitButtons.forEach(button=>button.disabled=true);
  const v=id=>$('#'+id).value.trim();
  const isPhoneNotice=type==='aviso',device=isPhoneNotice?v('fDevice'):'';const custom_fields={};
  $$('[data-custom-key]', $('#noticeForm')).forEach(el=>{const c=$('input,select,textarea',el);custom_fields[el.dataset.customKey]=c.type==='checkbox'?c.checked:c.value;});
  const category=categoryFor(device);
  const row={company_id:currentCompany.id,landing_id:null,notice_type:type,status:v('fStatus')||'Nuevo',customer_name:v('fName'),phone:v('fPhone'),email:$('#fEmail')?.value?.trim()||null,locality:v('fLocality')||null,postal_code:v('fPostal')||null,device:device||null,category:isPhoneNotice?category:null,brand:isPhoneNotice?(v('fBrand')||null):null,issue:v('fIssue')||null,custom_fields,unit_price:0,created_by:user.id};
  if(!isPhoneNotice&&relatedNoticeMatch)row.related_notice_id=relatedNoticeMatch.id;
  if(row.status==='Sale'&&isPhoneNotice)row.unit_price=Number(tariffForNotice(row)?.price||0);
  const {data,error}=await db.from('notices').insert(row).select().single();
  if(error){submitButtons.forEach(button=>button.disabled=false);toast(errorText(error),'No se pudo guardar el aviso');return;}
  submitButtons.forEach(button=>button.disabled=false);
  notices.unshift(data);relatedNoticeMatch=null;$('#modal').classList.remove('open');event.target.reset();renderRows();renderComplaints();renderClientHistory();
  if(type!=='aviso'&&data.status==='Sale')await sendNoticeToConfiguredIntegrations(data);
  else if(type!=='aviso')toast('Se ha guardado sin enviar: cliente equivocado o llamada ajena a la empresa.','Registro guardado');
  else if(data.status==='Sale')await sendNoticeToConfiguredIntegrations(data);
  if(type==='aviso'&&data.status!=='Sale')toast('Teléfono · '+(data.device||'Aviso')+' · '+formatDate(data.received_at),'Aviso guardado en el CRM');
  if(saveAndSchedule){showPage('agenda');await openAppointmentDialog(null,{notice_id:data.id});}
}
function showSettingsTab(name) {
  $$('[data-settings-tab]').forEach(button=>button.classList.toggle('active',button.dataset.settingsTab===name));
  const panelName=(name==='phone-fields'||name==='landing-fields')?'fields':name;
  $$('#page-configuracion [data-settings-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.settingsPanel===panelName));
  if(name==='phone-fields'){fieldScope='phone';renderFields();}
  if(name==='landing-fields'){fieldScope='landing';renderFields();}
}
async function renderSettings() {
  renderCompanyBrand();
  if(!isSuperAdmin)return;
  if(!currentCompany)return;
  const article=$('#brandPanel');
  if(article) {
    const input=$('input[value="Global Técnicos"]',article)||$('input',article); if(input)input.value=currentCompany.name;
    const color=$('input[type=color]',article);if(color){color.value=currentCompany.primary_color||'#5267e8';color.oninput=()=>applyCompanyTheme(color.value);}
    let logoPreview=$('.company-logo',article);
    if(currentCompany.logo_path){
      if(!logoPreview){logoPreview=document.createElement('img');logoPreview.className='company-logo';logoPreview.alt='Logo de '+currentCompany.name;logoPreview.style='max-width:180px;max-height:72px;object-fit:contain;display:block;margin:10px 0';article.append(logoPreview);}
      logoPreview.src=currentCompany.logo_path;logoPreview.alt='Logo de '+currentCompany.name;logoPreview.hidden=false;
    } else if(logoPreview){logoPreview.remove();}
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
async function openCompanyDetails(companyId) {
  const company=companies.find(c=>c.id===companyId);if(!company)return;
  const answer=await formDialog({title:'Datos de la empresa',description:'Consulta o actualiza los datos generales y el logo.',fields:[
    {key:'name',label:'Nombre de la empresa',value:company.name,required:true},
    {key:'administrator_name',label:'Administrador o representante',value:company.administrator_name||''},
    {key:'tax_id',label:'CIF / NIF',value:company.tax_id||''},
    {key:'address',label:'Dirección',type:'textarea',value:company.address||''},
    {key:'postal_code',label:'Código postal',value:company.postal_code||''},
    {key:'city',label:'Localidad',value:company.city||''},
    {key:'province',label:'Provincia',value:company.province||''},
    {key:'contact_email',label:'Correo electrónico',type:'email',value:company.contact_email||''},
    {key:'contact_phone',label:'Teléfono',type:'tel',value:company.contact_phone||''},
    {key:'logo_file',label:'Logo de la empresa (PNG, JPG, WEBP o SVG; máximo 2 MB)',type:'file',accept:'image/png,image/jpeg,image/webp,image/svg+xml'}
  ]});
  if(!answer)return;
  const file=answer.logo_file;
  if(file&&(file.size>2*1024*1024||!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type))){toast('El logo debe ser PNG, JPG, WEBP o SVG y no superar 2 MB.','Archivo no válido');return;}
  const payload={
    name:answer.name.trim(),
    administrator_name:answer.administrator_name.trim()||null,
    tax_id:answer.tax_id.trim()||null,
    address:answer.address.trim()||null,
    postal_code:answer.postal_code.trim()||null,
    city:answer.city.trim()||null,
    province:answer.province.trim()||null,
    contact_email:answer.contact_email.trim()||null,
    contact_phone:answer.contact_phone.trim()||null
  };
  if(file){
    const ext=({jpeg:'jpg','svg+xml':'svg'}[file.type.split('/')[1]]||file.type.split('/')[1]);
    const path=company.id+'/logo-'+Date.now()+'.'+ext;
    const {error:uploadError}=await db.storage.from('company-logos').upload(path,file,{upsert:true,contentType:file.type});
    if(uploadError){toast(errorText(uploadError),'No se pudo subir el logo');return;}
    payload.logo_path=db.storage.from('company-logos').getPublicUrl(path).data.publicUrl;
  }
  const {data,error}=await db.from('companies').update(payload).eq('id',company.id).select().single();
  if(error){toast(errorText(error),'No se pudieron guardar los datos');return;}
  Object.assign(company,data);
  if(currentCompany?.id===company.id){
    Object.assign(currentCompany,data);
    renderCompanyPicker();renderSettings();
  }
  renderCompanyPage();
  toast('Datos de la empresa guardados.');
}
function renderCompanyPage() {
  if(!isSuperAdmin)return;
  const section=$('#page-empresas');if(!section)return;
  let grid=$('.simple-grid',section);if(!grid)return;
  grid.innerHTML=companies.map(c=>`<div class="placeholder-tile" style="display:flex;align-items:center;justify-content:space-between;gap:12px"><button type="button" data-company-card="${c.id}" style="flex:1;text-align:left;border:0;background:transparent;color:inherit;padding:0;cursor:pointer;display:flex;align-items:center;gap:12px"><span class="company-badge" style="width:52px;height:52px;flex:0 0 52px;display:grid;place-items:center;overflow:hidden">${c.logo_path?`<img src="${esc(c.logo_path)}" alt="Logo de ${esc(c.name)}" style="width:100%;height:100%;object-fit:contain;background:#fff;border-radius:inherit;padding:3px"/>`:esc(c.name.slice(0,2).toUpperCase())}</span><span style="display:grid;gap:5px;text-align:left"><strong>${esc(c.name)}</strong><small>${c.id===currentCompany?.id?'Empresa actual · Ver o editar datos':'Ver o editar datos'}</small></span></button><button type="button" class="mini-delete" data-delete-company="${c.id}" aria-label="Eliminar empresa ${esc(c.name)}" title="Eliminar empresa">×</button></div>`).join('')||'<div class="empty">Crea tu primera empresa.</div>';
  $$('[data-company-card]',grid).forEach(b=>b.onclick=()=>openCompanyDetails(b.dataset.companyCard));
  $$('[data-delete-company]',grid).forEach(b=>b.onclick=async()=>{
    const company=companies.find(c=>c.id===b.dataset.deleteCompany);if(!company)return;
    const confirmed=await confirmDialog(`¿Eliminar la empresa «${company.name}»? Se borrarán definitivamente sus avisos, landings, campos, tarifas, usuarios e integraciones. Esta acción no se puede deshacer.`);
    if(!confirmed)return;
    b.disabled=true;
    const {error}=await db.from('companies').delete().eq('id',company.id);
    if(error){b.disabled=false;toast(errorText(error),'No se pudo eliminar la empresa');return;}
    companies=companies.filter(c=>c.id!==company.id);
    if(currentCompany?.id===company.id){currentCompany=companies[0];}
    toast(`La empresa «${company.name}» y sus datos se han eliminado.`,'Empresa eliminada');
    renderCompanyPage();
    await loadMemberships();
  });
}
function renderMembers() {
  if(!isSuperAdmin)return;
  const section=$('#page-usuarios');if(!section)return;
  const grid=$('.simple-grid',section);if(grid)grid.innerHTML=members.filter(m=>m.user_id!==user?.id).map(m=>`<div class="placeholder-tile"><strong>${esc(m.email||m.user_id.slice(0,8))}</strong><small>Permisos para esta empresa</small><div class="button-row" style="margin-top:10px"><select data-member-role="${m.user_id}" aria-label="Permisos de ${esc(m.email||'usuario')}"><option value="gestor" ${m.role==='gestor'?'selected':''}>Gestor: avisos e informes</option><option value="consulta" ${m.role==='consulta'?'selected':''}>Consulta: solo lectura</option></select><button class="mini-delete" data-remove-member="${m.user_id}" aria-label="Quitar usuario">×</button></div></div>`).join('')||'<div class="empty">Todavía no hay usuarios normales en esta empresa.</div>';
  $$('[data-member-role]',section).forEach(select=>select.onchange=async()=>{const role=select.value,member=members.find(m=>m.user_id===select.dataset.memberRole);if(!member)return;select.disabled=true;const {error}=await db.from('company_members').update({role}).eq('company_id',currentCompany.id).eq('user_id',member.user_id);select.disabled=false;if(error){toast(errorText(error),'No se pudieron cambiar los permisos');renderMembers();return;}member.role=role;toast(`Permiso actualizado: ${role==='consulta'?'consulta':'gestor'}.`,'Permisos guardados');renderMembers();});
  $$('[data-remove-member]',section).forEach(b=>b.onclick=async()=>{if(!await confirmDialog('¿Retirar este usuario de la empresa?'))return;const {error}=await db.from('company_members').delete().eq('company_id',currentCompany.id).eq('user_id',b.dataset.removeMember);if(error)toast(errorText(error),'No se pudo retirar');else{members=members.filter(m=>m.user_id!==b.dataset.removeMember);renderMembers();}});
  const add=$('.page-head .primary-btn',section);if(add)add.onclick=async()=>{const answer=await formDialog({title:'Invitar usuario',description:'La persona solo tendrá acceso a esta empresa. Elige si podrá gestionar avisos o consultar la información.',fields:[{key:'email',label:'Correo electrónico',type:'email',required:true,autocomplete:'email'},{key:'role',label:'Permiso',type:'select',value:'gestor',options:[{value:'gestor',label:'Gestor: puede registrar y gestionar avisos'},{value:'consulta',label:'Consulta: solo lectura'}]}]});if(!answer)return;const {error}=await db.functions.invoke('invite-member',{body:{company_id:currentCompany.id,email:answer.email.trim(),role:answer.role}});toast(error?errorText(error):'Invitación enviada. El usuario recibirá un correo para acceder.',error?'No se pudo invitar':'Invitación enviada');if(!error)await loadCompanyData();};
}
async function editLandingChannels(landingId) {
  const landing=landings.find(l=>l.id===landingId);if(!landing)return;
  const available=notificationChannels.filter(kind=>{const target=formDestinations[kind];return Array.isArray(target)?target.length>0:!!String(target||'').trim();});
  if(!available.length){toast('Configura primero un canal y su destino para los avisos de formulario.','No hay canales disponibles');return;}
  const storedChannels=landingRoutes[landing.id];
  const selected=Array.isArray(storedChannels)?storedChannels:globalFormRoutes;
  const labels={telegram:'Telegram',whatsapp:'WhatsApp',email:'Correo electrónico'};
  const answer=await formDialog({title:'Canales de aviso · '+landing.name,description:'Elige por qué canales recibir los avisos de esta landing. El destino se toma de la configuración de Integraciones.',fields:available.map(kind=>({key:kind,label:labels[kind]||kind,type:'checkbox',value:selected.includes(kind)})),confirmText:'Guardar canales'});
  if(!answer)return;
  const landing_channels=available.filter(kind=>answer[kind]);
  const {error}=await db.functions.invoke('manage-integration',{body:{company_id:currentCompany.id,action:'save_landing_routes',landing_id:landing.id,landing_channels}});
  if(error){toast(errorText(error),'No se pudieron guardar los canales');return;}
  landingRoutes={...landingRoutes,[landing.id]:landing_channels};
  toast('Canales guardados para '+landing.name+'.','Configuración actualizada');
  await renderIntegrations();
}
async function uploadLandingLogo(landingId,file,input) {
  const landing=landings.find(l=>l.id===landingId);if(!file||!landing)return;
  if(file.size>2*1024*1024){toast('El logo no puede superar 2 MB.','Archivo demasiado grande');if(input)input.value='';return;}
  const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg'};
  const ext=extensions[file.type];if(!ext){toast('Usa un logo PNG, JPG, WebP o SVG.','Formato no compatible');if(input)input.value='';return;}
  const button=$(`[data-upload-landing-logo="${CSS.escape(landingId)}"]`,$('#landingIntegrations'));if(button)button.disabled=true;
  try {
    const path=`${currentCompany.id}/${landing.id}/logo-${Date.now()}.${ext}`;
    const {error:uploadError}=await db.storage.from('company-logos').upload(path,file,{upsert:false,contentType:file.type});
    if(uploadError)throw uploadError;
    const {data:publicData}=db.storage.from('company-logos').getPublicUrl(path);
    const {error:saveError}=await db.from('landings').update({logo_path:publicData.publicUrl}).eq('id',landing.id).select('id').single();
    if(saveError)throw saveError;
    landing.logo_path=publicData.publicUrl;
    toast('Logo guardado para '+landing.name+'.','Logo actualizado');
    await renderIntegrations();
  } catch(error) {
    toast(errorText(error),'No se pudo subir el logo');
  } finally {
    if(button)button.disabled=false;if(input)input.value='';
  }
}
async function renderIntegrations() {
  if(!isSuperAdmin)return;
  const section=$('#page-integraciones');if(!section)return;
  const old=$('.demo-banner',section);if(old)old.remove();
  $('#addLanding').onclick=async()=>{const answer=await formDialog({title:'Añadir landing',description:'Conecta un formulario web a esta empresa.',fields:[{key:'name',label:'Nombre de la landing',required:true},{key:'url',label:'URL de la landing',placeholder:'https://ejemplo.com'},{key:'domains',label:'Orígenes permitidos (separados por comas)',placeholder:'https://ejemplo.com'}]});if(!answer?.name.trim())return;const name=answer.name,url=answer.url.trim()||null,domains=answer.domains||'';const allowed_origins=domains.split(',').map(x=>x.trim()).filter(Boolean);const {data,error}=await db.from('landings').insert({company_id:currentCompany.id,name:name.trim(),url,allowed_origins}).select().single();if(error){toast(errorText(error),'No se pudo crear la landing');return;}landings.push(data);landings.sort((a,b)=>a.name.localeCompare(b.name));await loadCompanyData();showLandingCode(data);};
  $('#providerCards').innerHTML=`<article class="provider-card"><h4>Telegram</h4><p>Avisos normales y un grupo distinto para reclamaciones o anulaciones.</p><div class="button-row"><button class="outline-btn" data-config-channel="telegram">Configurar Telegram</button><button class="outline-btn" data-test-channel="telegram">Enviar prueba</button></div></article><article class="provider-card"><h4>WhatsApp</h4><p>Elige arriba qué avisos quieres recibir por WhatsApp.</p><div class="button-row"><button class="outline-btn" data-config-channel="whatsapp">Configurar WhatsApp</button><button class="outline-btn" data-test-channel="whatsapp">Enviar prueba</button></div></article><article class="provider-card"><h4>Correo electrónico</h4><p>Envía los tipos de aviso seleccionados a los correos configurados.</p><div class="button-row"><button class="outline-btn" data-config-channel="email">Configurar correo</button><button class="outline-btn" data-test-channel="email">Enviar prueba</button></div></article><article class="provider-card"><h4>Google Calendar</h4><p>Agenda independiente para ${esc(currentCompany?.name||'esta empresa')}. Requiere un OAuth Client ID web de Google Cloud, el origen del CRM autorizado y Calendar API activada.</p><label class="field" style="margin:8px 0"><span>ID de cliente OAuth de Google</span><input id="googleCalendarClientId" value="${esc(calendarConnection?.client_id||'')}" placeholder="...apps.googleusercontent.com" autocomplete="off"/></label><small id="googleCalendarStatus" style="display:block;margin-bottom:8px">${calendarConnection?.google_email?'Conectado a '+esc(calendarConnection.google_email)+' · Autoriza este navegador para sincronizar.':'Sin cuenta conectada.'}</small><div class="button-row"><button type="button" class="outline-btn" id="connectGoogleCalendar">${calendarConnection?'Autorizar este navegador':'Conectar Google Calendar'}</button>${calendarConnection?'<button type="button" class="mini-delete" id="disconnectGoogleCalendar" aria-label="Desconectar Google Calendar">×</button>':''}</div></article>`;
  $$('[data-config-channel]',$('#providerCards')).forEach(b=>b.onclick=()=>configureIntegration(b.dataset.configChannel));
  $$('[data-test-channel]',$('#providerCards')).forEach(b=>b.onclick=()=>testIntegration(b.dataset.testChannel));
  $('#connectGoogleCalendar')?.addEventListener('click',connectGoogleCalendar);
  $('#disconnectGoogleCalendar')?.addEventListener('click',disconnectGoogleCalendar);
  await renderNotificationRoutes();
  const host=$('#landingIntegrations');
  const channelNames={telegram:'Telegram',whatsapp:'WhatsApp',email:'Correo'};
  host.innerHTML=landings.map(l=>{const selected=Object.prototype.hasOwnProperty.call(landingRoutes,l.id)?landingRoutes[l.id]:null;const routeLabel=selected===null?'Usa destinos generales':selected.length?selected.map(k=>channelNames[k]||k).join(' · '):'Sin avisos automáticos';const logo=l.logo_path?`<img src="${esc(l.logo_path)}" alt="Logo de ${esc(l.name)}" style="max-width:150px;max-height:58px;object-fit:contain;display:block;margin:0;flex:0 0 auto">`:'';return `<div class="placeholder-tile"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px"><strong style="margin:0">${esc(l.name)}${l.is_active?'':' · Inactiva'}</strong>${logo}</div><small>${esc(l.url||'Sin URL guardada')}</small><small class="landing-channel-summary">Canales: ${esc(routeLabel)}</small><div class="button-row"><button class="outline-btn" data-code="${l.id}">Ver conexión</button><button class="outline-btn" data-landing-routes="${l.id}">Canales de aviso</button><button class="outline-btn" data-upload-landing-logo="${l.id}">${l.logo_path?'Cambiar logo':'Subir logo propio'}</button><input type="file" data-landing-logo-file="${l.id}" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Seleccionar logo de ${esc(l.name)}" style="display:none"><button class="mini-delete" data-delete-landing="${l.id}" aria-label="Desactivar landing">×</button></div></div>`}).join('')||'<div class="empty">Todavía no hay landings conectadas.</div>';
  const toggle=$('#toggleLandingList');
  const applyLandingListState=()=>{host.style.display=landingListCollapsed?'none':'';if(toggle){toggle.textContent=landingListCollapsed?'Mostrar landings':'Ocultar landings';toggle.setAttribute('aria-expanded',String(!landingListCollapsed));}};
  applyLandingListState();
  if(toggle)toggle.onclick=()=>{landingListCollapsed=!landingListCollapsed;localStorage.setItem('crm-landings-list-collapsed',String(landingListCollapsed));applyLandingListState();};

  $$('[data-upload-landing-logo]',host).forEach(button=>button.onclick=()=>{const input=$(`[data-landing-logo-file="${CSS.escape(button.dataset.uploadLandingLogo)}"]`,host);input?.click();});
  $$('[data-landing-logo-file]',host).forEach(input=>input.onchange=()=>uploadLandingLogo(input.dataset.landingLogoFile,input.files?.[0],input));
  $$('[data-code]',host).forEach(b=>b.onclick=()=>showLandingCode(landings.find(l=>l.id===b.dataset.code)));
  $$('[data-landing-routes]',host).forEach(b=>b.onclick=()=>editLandingChannels(b.dataset.landingRoutes));
  $$('[data-delete-landing]',host).forEach(b=>b.onclick=async()=>{if(!await confirmDialog('¿Desactivar esta landing? Sus avisos y tarifas históricas se conservarán.'))return;const {error}=await db.from('landings').update({is_active:false}).eq('id',b.dataset.deleteLanding);if(error)toast(errorText(error),'No se pudo desactivar');else await loadCompanyData();});
}
async function renderNotificationRoutes() {
  const host=$('#notificationRoutes');if(!host)return;
  host.innerHTML='<div class="empty" style="padding:16px">Cargando destinos…</div>';
  const {data,error}=await db.functions.invoke('manage-integration',{body:{company_id:currentCompany.id,action:'get_routes'}});
  if(error){host.innerHTML=`<div class="empty">No se pudieron cargar los destinos: ${esc(errorText(error))}</div>`;return;}
  const channels=data?.channels||[],routes=data?.routes||{form:[],phone:[],complaint:[]},blocked=data?.blocked||{form:[],phone:[],complaint:[]},destinations=data?.destinations||{};
  landingRoutes=data?.landing_routes||{};notificationChannels=channels;globalFormRoutes=routes.form||[];formDestinations=destinations.form||{};
  const rows=[['form','Avisos recibidos por formulario web'],['phone','Avisos recibidos por teléfono («Aviso Sacado»)'],['complaint','Reclamaciones o anulaciones']];
  const channelMeta=[['telegram','Telegram','Grupo o chat'],['whatsapp','WhatsApp','Número con prefijo'],['email','Correo','Destinatarios separados por comas']];
  host.innerHTML=`<div class="route-table-scroll"><table class="route-table"><thead><tr><th>TIPO DE AVISO</th>${channelMeta.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map(([type,label])=>`<tr><td>${label}</td>${channelMeta.map(([channel,label,placeholder])=>{const unavailable=blocked[type]?.includes(channel);const target=destinations[type]?.[channel]||'';return `<td class="route-destination-cell"><label class="route-check"><input type="checkbox" aria-label="Enviar por ${channel}" data-route-type="${type}" data-route-channel="${channel}" ${routes[type]?.includes(channel)?'checked':''} ${channels.includes(channel)?'':'disabled'} ${unavailable?'title="Indica un destino para activar este canal"':''} /> Usar</label><input class="route-destination-input" type="text" placeholder="${placeholder}" aria-label="Destino ${label} para ${type}" data-route-destination-type="${type}" data-route-destination-channel="${channel}" value="${esc(Array.isArray(target)?target.join(', '):target)}" ${channels.includes(channel)?'':'disabled'} /></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
  const hint=$('#routeSaveHint');if(hint)hint.textContent=channels.length?'Activa cada canal e indica aquí su destino específico para este tipo de aviso.':'Configura primero los canales y luego añade aquí los destinatarios de cada tipo.';
  const save=$('#saveNotificationRoutes');if(save){save.disabled=!channels.length;save.onclick=async()=>{const selected={form:[],phone:[],complaint:[]},targets={form:{},phone:{},complaint:{}};$$('[data-route-type]',host).forEach(input=>{if(input.checked)selected[input.dataset.routeType].push(input.dataset.routeChannel);});$$('[data-route-destination-type]',host).forEach(input=>{targets[input.dataset.routeDestinationType][input.dataset.routeDestinationChannel]=input.value;});save.disabled=true;const result=await db.functions.invoke('manage-integration',{body:{company_id:currentCompany.id,action:'save_routes',routes:selected,destinations:targets}});save.disabled=false;if(result.error){toast(errorText(result.error),'No se pudieron guardar los destinos');return;}toast('Se han guardado los canales y sus destinatarios.','Destinos guardados');await renderNotificationRoutes();}};
}
async function configureIntegration(kind) {
  let config={};
  if(kind==='telegram') {
    const answer=await formDialog({title:'Configurar Telegram',description:'Conecta el bot. Los grupos de formulario, avisos telefónicos y reclamaciones se indican por separado en la tabla de destinos.',fields:[{key:'bot_token',label:'Token del bot',type:'password',required:true}]});
    if(!answer)return;config=answer;
  } else if(kind==='whatsapp') {
    const answer=await formDialog({title:'Configurar WhatsApp Business',description:'Conecta WhatsApp Business con el token y el ID del número de Meta. El número destinatario se configura por separado para formularios, avisos telefónicos y reclamaciones.',fields:[{key:'access_token',label:'Token de acceso de Meta',type:'password',required:true},{key:'phone_number_id',label:'ID del número de WhatsApp',required:true},{key:'template_name',label:'Nombre de la plantilla aprobada',placeholder:'aviso_nuevo',required:true},{key:'language',label:'Idioma de la plantilla',placeholder:'es',value:'es',required:true}]});
    if(!answer)return;config=answer;
  } else {
    const answer=await formDialog({title:'Configurar correo',description:'Datos del servicio de envío Resend. Los destinatarios se configuran por separado para formularios, avisos telefónicos y reclamaciones.',fields:[{key:'api_key',label:'API key de Resend',type:'password',required:true},{key:'from',label:'Remitente verificado',placeholder:'CRM <avisos@dominio.com>',required:true}]});
    if(!answer)return;config=answer;
  }
  const {error}=await db.functions.invoke('manage-integration',{body:{company_id:currentCompany.id,kind,config,enabled:true}});
  toast(error?errorText(error):'Integración guardada de forma privada.',error?'No se pudo guardar':'Conexión guardada');
  if(!error)await renderNotificationRoutes();
}
async function testIntegration(kind) {
  const {error}=await db.functions.invoke('notify-test',{body:{company_id:currentCompany.id,kind}});
  toast(error?errorText(error):'Mensaje de prueba enviado.',error?'No se pudo enviar':'Prueba enviada');
}
async function showLandingCode(landing) {
  if(!landing)return;
  const hostedOrigin=window.location.origin;
  const allowedOrigins=Array.isArray(landing.allowed_origins)?landing.allowed_origins:[];
  if(!allowedOrigins.includes(hostedOrigin)){
    const nextOrigins=[...allowedOrigins,hostedOrigin];
    const {error}=await db.from('landings').update({allowed_origins:nextOrigins}).eq('id',landing.id);
    if(error){toast(errorText(error),'No se pudo habilitar el formulario alojado');return;}
    landing.allowed_origins=nextOrigins;
  }
  const endpoint=CFG.url.replace(/\/$/,'')+'/functions/v1/service-form';
  const code=`fetch('${endpoint}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({landing_key:'${landing.endpoint_key}',data:{customer_name:'Nombre',phone:'600000000',device:'Lavadora',issue:'Descripción de la avería'}})}).then(r=>r.json())`;
  const hostedUrl=new URL('formulario.html',document.baseURI);
  hostedUrl.searchParams.set('key',landing.endpoint_key);
  const hostedLink=hostedUrl.href;
  const embedCode=`<iframe src="${hostedLink}" title="Formulario de solicitud" loading="lazy" style="width:100%;min-height:850px;border:0"></iframe>`;
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop open';
  backdrop.innerHTML=`<div class="modal" style="max-width:720px;max-height:90vh;overflow:auto"><div class="modal-head"><div><h2>Conectar ${esc(landing.name)}</h2><p>Usa el formulario alojado o conecta el formulario de tu web con este endpoint.</p></div><button class="close" type="button" aria-label="Cerrar">×</button></div><p><strong>Formulario alojado · enlace directo</strong></p><div class="integration-code">${esc(hostedLink)}</div><p><strong>Formulario incrustable · iframe</strong></p><div class="integration-code">${esc(embedCode)}</div><p><strong>Endpoint para integrar un formulario propio</strong></p><div class="integration-code">${esc(endpoint)}</div><p><strong>Clave de landing:</strong></p><div class="integration-code">${esc(landing.endpoint_key)}</div><p><strong>Ejemplo JavaScript:</strong></p><div class="integration-code">${esc(code)}</div><div class="modal-actions"><button class="outline-btn" id="copyHostedLink">Copiar enlace</button><button class="outline-btn" id="copyEmbedCode">Copiar iframe</button><button class="outline-btn" id="copyLandingCode">Copiar ejemplo</button><button class="primary-btn close-code" type="button">Cerrar</button></div></div>`;
  document.body.append(backdrop);$('.close',backdrop).onclick=()=>backdrop.remove();$('.close-code',backdrop).onclick=()=>backdrop.remove();
  $('#copyHostedLink',backdrop).onclick=async()=>{await navigator.clipboard.writeText(hostedLink);toast('Enlace del formulario copiado.');};
  $('#copyEmbedCode',backdrop).onclick=async()=>{await navigator.clipboard.writeText(embedCode);toast('Código para incrustar copiado.');};
  $('#copyLandingCode',backdrop).onclick=async()=>{await navigator.clipboard.writeText(code);toast('Ejemplo JavaScript copiado.');};
}

function localDateKey(value) {
  const date=value instanceof Date?value:new Date(value);
  return String(date.getFullYear()).padStart(4,'0')+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
function localDateTimeValue(value) {
  const date=value?new Date(value):new Date();
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function appointmentTime(value) {
  return new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));
}
function appointmentDateLabel(value,options={weekday:'long',day:'numeric',month:'long'}) {
  return new Intl.DateTimeFormat('es-ES',options).format(new Date(value));
}
function agendaEligibleNotices() {
  return notices.filter(n=>n.notice_type==='aviso'&&n.status==='Sale')
    .sort((a,b)=>new Date(b.received_at)-new Date(a.received_at));
}
function agendaNoticeLabel(notice) {
  const parts=[notice.customer_name||'Cliente sin nombre',notice.phone||'Sin teléfono',notice.device||notice.category||'Aviso técnico',notice.landing_id?landingName(notice.landing_id):'Teléfono',formatDate(notice.received_at)];
  return parts.filter(Boolean).join(' · ');
}
function appointmentAddressFromNotice(notice) {
  if(!notice)return '';
  const source=notice.landing_id?fieldsForLanding(notice.landing_id):fieldsForPhone();
  const addressField=source.find(field=>/direcci[oó]n/i.test(String(field.label||''))||/address|direccion/i.test(String(field.field_key||'')));
  const custom=notice.custom_fields||{};
  const value=addressField?custom[addressField.field_key]:null;
  return String(value||'').trim()||[notice.locality,notice.postal_code].filter(Boolean).join(', ');
}
function agendaVisibleAppointments() {
  const eligibleIds=new Set(agendaEligibleNotices().map(n=>n.id));
  return appointments.filter(a=>a.notice_id&&eligibleIds.has(a.notice_id));
}
function renderAgenda() {
  const grid=$('#agendaCalendarGrid');if(!grid)return;
  if(!agendaSelectedDate)agendaSelectedDate=localDateKey(new Date());
  const year=agendaMonth.getFullYear(),month=agendaMonth.getMonth();
  const monthLabel=$('#agendaMonthLabel');if(monthLabel)monthLabel.textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(agendaMonth);
  const monthStart=new Date(year,month,1,12),offset=(monthStart.getDay()+6)%7;
  const gridStart=new Date(year,month,1-offset,12);
  const today=localDateKey(new Date());
  grid.innerHTML=Array.from({length:42},(_,index)=>{
    const date=new Date(gridStart);date.setDate(gridStart.getDate()+index);
    const key=localDateKey(date),items=agendaVisibleAppointments().filter(a=>localDateKey(a.start_at)===key).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at));
    const chips=items.slice(0,2).map(a=>'<span class="agenda-day-chip '+(a.status==='cancelled'?'cancelled':a.status==='completed'?'completed':'')+'">'+appointmentTime(a.start_at)+' '+esc(a.customer_name)+'</span>').join('');
    const more=items.length>2?'<small class="agenda-more">+'+(items.length-2)+' más</small>':'';
    const classes=['agenda-day-cell',date.getMonth()!==month?'other-month':'',key===today?'today':'',key===agendaSelectedDate?'selected':''].filter(Boolean).join(' ');
    return '<button type="button" class="'+classes+'" data-agenda-date="'+key+'"><span class="agenda-day-number">'+date.getDate()+'</span>'+chips+more+'</button>';
  }).join('');
  const selected=$('#agendaDayLabel');if(selected)selected.textContent=appointmentDateLabel(new Date(agendaSelectedDate+'T12:00:00'),{weekday:'long',day:'numeric',month:'long'});
  const dayList=$('#agendaDayEvents'),dayCount=$('#agendaDayCount');
  const daily=agendaVisibleAppointments().filter(a=>localDateKey(a.start_at)===agendaSelectedDate).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at));
  if(dayCount)dayCount.textContent=daily.length+' '+(daily.length===1?'cita':'citas');
  if(dayList)dayList.innerHTML=daily.map(a=>{
    const status=a.status==='cancelled'?'Anulada':a.status==='completed'?'Realizada':'Programada';
    const sync=a.google_event_id?'Sincronizada con Google Calendar':a.google_sync_error?'Pendiente de sincronizar con Google Calendar':'';
    const duration=Number(a.duration_minutes)||60;
    return '<article class="agenda-event '+(a.status==='cancelled'?'cancelled':a.status==='completed'?'completed':'')+'"><div class="agenda-event-time">'+appointmentTime(a.start_at)+'<small>'+duration+' min</small></div><div class="agenda-event-info"><strong>'+esc(a.customer_name)+'</strong><span>'+esc(a.phone)+'</span><span>'+esc(a.address||appointmentAddressFromNotice(notices.find(n=>n.id===a.notice_id))||'Sin dirección indicada')+'</span><span>'+esc(a.notes||'')+'</span><small>'+status+(sync?' · '+sync:'')+'</small></div><div class="agenda-event-actions"><button type="button" class="outline-btn" data-edit-appointment="'+esc(a.id)+'">Editar</button>'+(a.status==='scheduled'?'<button type="button" class="outline-btn" data-complete-appointment="'+esc(a.id)+'">Realizada</button><button type="button" class="outline-btn" data-cancel-appointment="'+esc(a.id)+'">Anular</button>':'')+(a.status==='cancelled'?'<button type="button" class="outline-btn" data-reopen-appointment="'+esc(a.id)+'">Reprogramar</button>':'')+'<button type="button" class="mini-delete" data-delete-appointment="'+esc(a.id)+'" aria-label="Eliminar cita">×</button></div></article>';
  }).join('')||'<div class="empty">No hay citas para este día.</div>';
  $$('[data-agenda-date]',grid).forEach(button=>button.onclick=()=>{agendaSelectedDate=button.dataset.agendaDate;renderAgenda();});
  $$('[data-edit-appointment]',dayList).forEach(button=>button.onclick=()=>openAppointmentDialog(appointments.find(a=>a.id===button.dataset.editAppointment)));
  $$('[data-complete-appointment]',dayList).forEach(button=>button.onclick=()=>setAppointmentStatus(button.dataset.completeAppointment,'completed'));
  $$('[data-cancel-appointment]',dayList).forEach(button=>button.onclick=()=>setAppointmentStatus(button.dataset.cancelAppointment,'cancelled'));
  $$('[data-reopen-appointment]',dayList).forEach(button=>button.onclick=()=>{const appointment=appointments.find(a=>a.id===button.dataset.reopenAppointment);if(appointment)openAppointmentDialog(appointment,{status:'scheduled'});});
  $$('[data-delete-appointment]',dayList).forEach(button=>button.onclick=()=>deleteAppointment(button.dataset.deleteAppointment));
}
async function openAppointmentDialog(existing=null,overrides={}) {
  const eligible=agendaEligibleNotices();
  const requestedId=existing?.notice_id||overrides.notice_id||'';
  if(!eligible.length){toast('Para agendar, primero debe existir un aviso marcado como sacado.','No hay avisos sacados');return;}
  if(existing&&!eligible.some(n=>n.id===existing.notice_id)){toast('Solo se pueden agendar clientes con un aviso marcado como sacado.','Aviso no disponible');return;}
  const source=existing||{};
  const answer=await formDialog({
    title:existing?'Editar cita':'Agendar cita',
    description:'Elige un aviso sacado. El cliente y su teléfono se completan desde ese aviso.',
    fields:[
      {key:'notice_id',label:'Aviso sacado · cliente',type:'select',value:requestedId,required:true,options:eligible.map(n=>({value:n.id,label:agendaNoticeLabel(n)}))},
      {key:'start_at',label:'Fecha y hora',type:'datetime-local',value:localDateTimeValue(source.start_at||defaultAppointmentStart()),required:true},
      {key:'duration_minutes',label:'Duración en minutos',type:'number',value:source.duration_minutes||60,required:true},
      {key:'notes',label:'Notas para el técnico',type:'textarea',value:source.notes||''},
      {key:'status',label:'Estado',type:'select',value:overrides.status||((source.status==='cancelled')?'scheduled':source.status||'scheduled'),options:[{value:'scheduled',label:'Programada'},{value:'completed',label:'Realizada'}]}
    ]
  });
  if(!answer)return;
  const selectedNotice=eligible.find(n=>n.id===answer.notice_id);
  if(!selectedNotice){toast('Selecciona un aviso marcado como sacado.','Aviso no disponible');return;}
  const start=new Date(answer.start_at);
  if(!Number.isFinite(start.getTime())){toast('Indica una fecha y hora válidas.','Fecha no válida');return;}
  const payload={
    company_id:currentCompany.id,
    notice_id:selectedNotice.id,
    customer_name:selectedNotice.customer_name||'Cliente',
    phone:selectedNotice.phone||'',
    start_at:start.toISOString(),
    duration_minutes:Math.max(15,Math.min(480,Number(answer.duration_minutes)||60)),
    address:appointmentAddressFromNotice(selectedNotice)||null,
    notes:answer.notes.trim()||null,
    status:answer.status||'scheduled',
    updated_at:new Date().toISOString()
  };
  let record,error;
  if(existing){
    const result=await db.from('appointments').update(payload).eq('id',existing.id).select().single();
    record=result.data;error=result.error;
  }else{
    payload.created_by=user.id;
    const result=await db.from('appointments').insert(payload).select().single();
    record=result.data;error=result.error;
  }
  if(error){toast(errorText(error),existing?'No se pudo cambiar la cita':'No se pudo guardar la cita');return;}
  if(existing)Object.assign(existing,record);else appointments.push(record);
  agendaSelectedDate=localDateKey(record.start_at);agendaMonth=new Date(new Date(record.start_at).getFullYear(),new Date(record.start_at).getMonth(),1);
  renderAgenda();
  let sync=null;
  if(calendarConnection)sync=await syncAppointmentWithGoogle(record);
  if(sync?.error)toast('La cita se guardó en la agenda del CRM, pero Google Calendar no se actualizó: '+sync.error,'Cita guardada');
  else toast(existing?'Cita actualizada.':'Cita agendada.');
}
function defaultAppointmentStart() {
  const date=new Date();date.setMinutes(0,0,0);date.setHours(date.getHours()+1);return date;
}
async function setAppointmentStatus(id,status) {
  const appointment=appointments.find(a=>a.id===id);if(!appointment)return;
  if(status==='cancelled'&&!await confirmDialog('¿Anular la cita de '+appointment.customer_name+'? Si Google Calendar está conectado, también se eliminará allí.'))return;
  const {data,error}=await db.from('appointments').update({status,updated_at:new Date().toISOString()}).eq('id',id).select().single();
  if(error){toast(errorText(error),'No se pudo cambiar el estado');return;}
  Object.assign(appointment,data);renderAgenda();
  const sync=calendarConnection?await syncAppointmentWithGoogle(appointment):null;
  if(sync?.error)toast('El cambio se guardó en el CRM, pero Google Calendar no se actualizó: '+sync.error,'Sincronización pendiente');
  else toast(status==='cancelled'?'Cita anulada.':'Cita marcada como realizada.');
}
async function deleteAppointment(id) {
  const appointment=appointments.find(a=>a.id===id);if(!appointment)return;
  if(!await confirmDialog('¿Eliminar definitivamente la cita de '+appointment.customer_name+' del CRM? Esta acción no se puede deshacer.'))return;
  if(appointment.google_event_id&&calendarConnection){
    if(!hasGoogleCalendarToken()){toast('Antes de borrar esta cita, vuelve a autorizar Google Calendar en Integraciones para eliminarla también allí.','Google Calendar necesita autorización');return;}
    const sync=await syncAppointmentWithGoogle(appointment,'delete');
    if(sync?.error){toast('No se borró la cita porque Google Calendar no confirmó la eliminación: '+sync.error,'No se pudo eliminar');return;}
  }
  const {error}=await db.from('appointments').delete().eq('id',id);
  if(error){toast(errorText(error),'No se pudo eliminar');return;}
  appointments=appointments.filter(a=>a.id!==id);renderAgenda();toast('Cita eliminada.');
}
function hasGoogleCalendarToken() {
  return !!(googleCalendarAccessToken&&googleCalendarAccessCompanyId===currentCompany?.id&&googleCalendarAccessExpiresAt>Date.now()+30000);
}
function requestGoogleCalendarToken(clientId,prompt='select_account') {
  if(!window.google?.accounts?.oauth2)return Promise.reject(new Error('No se ha cargado Google Identity Services. Recarga la página e inténtalo otra vez.'));
  return new Promise((resolve,reject)=>{
    let completed=false;
    const finish=(fn,value)=>{if(completed)return;completed=true;clearTimeout(timeout);fn(value);};
    const timeout=setTimeout(()=>finish(reject,new Error('No se completó la autorización de Google.')) ,120000);
    const client=window.google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:'openid email https://www.googleapis.com/auth/calendar.events',
      callback:response=>{
        if(response.error){finish(reject,new Error(response.error_description||response.error));return;}
        googleCalendarAccessToken=response.access_token;
        googleCalendarAccessExpiresAt=Date.now()+(Number(response.expires_in)||3600)*1000;
        googleCalendarAccessCompanyId=currentCompany.id;
        finish(resolve,response.access_token);
      },
      error_callback:error=>finish(reject,new Error(error?.message||'Google no completó la autorización.'))
    });
    client.requestAccessToken({prompt,include_granted_scopes:true});
  });
}
async function connectGoogleCalendar() {
  const clientId=$('#googleCalendarClientId')?.value?.trim()||'';
  if(!clientId){toast('Pega primero el ID de cliente OAuth de Google Cloud.','Falta el ID de Google');return;}
  if(!clientId.endsWith('.apps.googleusercontent.com')){toast('El ID de cliente no parece válido.','Revisa el ID de Google');return;}
  let tokenPromise;
  try{tokenPromise=requestGoogleCalendarToken(clientId,'select_account');}
  catch(error){toast(errorText(error),'No se pudo conectar Google Calendar');return;}
  try{
    const token=await tokenPromise;
    const profileResponse=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+token}});
    if(!profileResponse.ok)throw new Error('Google no devolvió el correo de la cuenta.');
    const profile=await profileResponse.json();
    const connection={company_id:currentCompany.id,client_id:clientId,calendar_id:calendarConnection?.calendar_id||'primary',google_email:profile.email||null,connected_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const {data,error}=await db.from('calendar_connections').upsert(connection,{onConflict:'company_id'}).select().single();
    if(error)throw error;
    calendarConnection=data;renderIntegrations();toast('Google Calendar conectado a '+(profile.email||'la empresa')+'.','Integración lista');
    await syncPendingCalendarAppointments();
  }catch(error){toast(errorText(error),'No se pudo conectar Google Calendar');}
}
async function disconnectGoogleCalendar() {
  if(!calendarConnection)return;
  if(!await confirmDialog('Se desconectará Google Calendar de esta empresa. Las citas ya sincronizadas no se borrarán de Google.'))return;
  if(googleCalendarAccessToken&&googleCalendarAccessCompanyId===currentCompany?.id&&window.google?.accounts?.oauth2){
    try{window.google.accounts.oauth2.revoke(googleCalendarAccessToken,()=>{});}catch(_){}
  }
  const {error}=await db.from('calendar_connections').delete().eq('company_id',currentCompany.id);
  if(error){toast(errorText(error),'No se pudo desconectar');return;}
  calendarConnection=null;googleCalendarAccessToken=null;googleCalendarAccessExpiresAt=0;googleCalendarAccessCompanyId=null;
  renderIntegrations();toast('Google Calendar desconectado.');
}
function calendarEventBody(appointment) {
  const end=new Date(new Date(appointment.start_at).getTime()+(Number(appointment.duration_minutes)||60)*60000);
  return {
    summary:'Cita de reparación · '+appointment.customer_name,
    location:appointment.address||'',
    description:['Cliente: '+appointment.customer_name,'Teléfono: '+appointment.phone,appointment.notes||''].filter(Boolean).join('\n'),
    start:{dateTime:new Date(appointment.start_at).toISOString(),timeZone:'Europe/Madrid'},
    end:{dateTime:end.toISOString(),timeZone:'Europe/Madrid'}
  };
}
async function googleCalendarRequest(url,method,body) {
  if(!hasGoogleCalendarToken())throw new Error('La autorización de Google ha caducado. Pulsa «Conectar Google Calendar» en Integraciones y vuelve a sincronizar.');
  const response=await fetch(url,{method,headers:{Authorization:'Bearer '+googleCalendarAccessToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(response.status===204)return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error?.message||'Google Calendar rechazó la operación ('+response.status+').');
  return data;
}
async function syncAppointmentWithGoogle(appointment,action='save') {
  if(!calendarConnection)return {skipped:true};
  try{
    const calendarId=encodeURIComponent(calendarConnection.calendar_id||'primary');
    let eventId=appointment.google_event_id||null;
    if(action==='delete'||appointment.status==='cancelled'){
      if(eventId)await googleCalendarRequest('https://www.googleapis.com/calendar/v3/calendars/'+calendarId+'/events/'+encodeURIComponent(eventId),'DELETE');
      eventId=null;
    }else{
      let event;
      if(eventId){
        try{event=await googleCalendarRequest('https://www.googleapis.com/calendar/v3/calendars/'+calendarId+'/events/'+encodeURIComponent(eventId),'PUT',calendarEventBody(appointment));}
        catch(error){if(!String(error.message).includes('(404)'))throw error;event=await googleCalendarRequest('https://www.googleapis.com/calendar/v3/calendars/'+calendarId+'/events','POST',calendarEventBody(appointment));}
      }else event=await googleCalendarRequest('https://www.googleapis.com/calendar/v3/calendars/'+calendarId+'/events','POST',calendarEventBody(appointment));
      eventId=event.id;
    }
    const patch={google_event_id:eventId,google_sync_error:null,google_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const {data,error}=await db.from('appointments').update(patch).eq('id',appointment.id).select().single();
    if(error)throw error;
    Object.assign(appointment,data);
    return {ok:true};
  }catch(error){
    const message=errorText(error);
    const {data}=await db.from('appointments').update({google_sync_error:message,updated_at:new Date().toISOString()}).eq('id',appointment.id).select().single();
    if(data)Object.assign(appointment,data);
    return {error:message};
  }
}
async function syncPendingCalendarAppointments() {
  let synced=0,failed=0;
  for(const appointment of [...appointments]){
    const pending=appointment.status==='cancelled'?!!appointment.google_event_id:(!appointment.google_event_id||!!appointment.google_sync_error);
    if(!pending)continue;
    const result=await syncAppointmentWithGoogle(appointment);
    if(result.error)failed++;else if(result.ok)synced++;
  }
  renderAgenda();
  if(failed)toast('Se sincronizaron '+synced+' citas; '+failed+' necesitan revisión.','Sincronización parcial');
  else toast('Agenda sincronizada con Google Calendar.','Sincronización lista');
}

function showPage(name) {
  if(!isSuperAdmin&&!['avisos-landing','avisos-phone','informes','reclamaciones','historial','agenda'].includes(name))return;
  const pageName=(name==='avisos-landing'||name==='avisos-phone')?'avisos':name;
  $$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+pageName));
  $$('.nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  const labels={'avisos-landing':'Avisos por formulario','avisos-phone':'Avisos por teléfono',informes:'Informes',reclamaciones:'Reclamaciones o anulaciones',historial:'Historial de clientes',agenda:'Agenda',empresas:'Empresas',usuarios:'Usuarios y permisos',personalizacion:'Personalización',configuracion:'Configuración',integraciones:'Integraciones'};
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
  if(pageName==='historial')renderClientHistory();
  if(pageName==='agenda')renderAgenda();
  $('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});
}
function wireUI() {
  installPendingUi();
  $('#sidebar').addEventListener('click',event=>{const button=event.target.closest('button[data-page]');if(button){event.preventDefault();showPage(button.dataset.page);}});
  setupDate('main');setupDate('report');
  ['tableSearch','globalSearch'].forEach(id=>$('#'+id).addEventListener('input',renderRows));
  $('#historySearch').addEventListener('input',renderClientHistory);
  ['statusFilter','landingFilter','weekdayFilter'].forEach(id=>$('#'+id).addEventListener('change',renderRows));
  ['reportWeekday','reportLanding','reportStatus'].forEach(id=>$('#'+id).addEventListener('change',renderReport));
  $$('[data-notice-view]').forEach(button=>button.addEventListener('click',()=>setNoticeView(button.dataset.noticeView)));
  $('#cardFieldsToggle').addEventListener('click',()=>{$('#cardFieldPanel').hidden=!$('#cardFieldPanel').hidden;});
  $('#newNotice').addEventListener('click',()=>openPhoneNotice('aviso'));
  $('#newComplaint').addEventListener('click',()=>openPhoneNotice('reclamacion'));
  $('#agendaPrev').addEventListener('click',()=>{agendaMonth=new Date(agendaMonth.getFullYear(),agendaMonth.getMonth()-1,1);renderAgenda();});
  $('#agendaNext').addEventListener('click',()=>{agendaMonth=new Date(agendaMonth.getFullYear(),agendaMonth.getMonth()+1,1);renderAgenda();});
  $('#agendaToday').addEventListener('click',()=>{agendaSelectedDate=localDateKey(new Date());agendaMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderAgenda();});
  $('#newAppointment').addEventListener('click',()=>openAppointmentDialog());

  $('#fRecordType').addEventListener('change',()=>{syncDefaultFields();renderExtraFields();updateRecordFormMode();});
  $('#fStatus').addEventListener('change',updateRecordSubmitLabel);
  $('#closeModal').addEventListener('click',()=>$('#modal').classList.remove('open'));
  $('#cancelModal').addEventListener('click',()=>$('#modal').classList.remove('open'));
  $('#modal').addEventListener('click',e=>{if(e.target.id==='modal')e.currentTarget.classList.remove('open');});
  $('#fPhone').addEventListener('input',()=>{duplicatePhoneBypass=null;});
  $('#noticeForm').addEventListener('submit',createNotice);
  $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  $('#pendingLandingButton').addEventListener('click',openPendingNotices);
  $('#pendingMetric').addEventListener('click',openPendingNotices);
  $('#pendingMetric').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPendingNotices();}});
  $('#exportBtn').addEventListener('click',()=>exportCsv(false));$('#reportExport').addEventListener('click',()=>exportCsv(true));
  $('#addField').addEventListener('click',addField);
  $$('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>showSettingsTab(button.dataset.settingsTab)));
  $('#fieldLandingFilter').addEventListener('change',()=>{$('#newFieldLanding').value=$('#fieldLandingFilter').value;renderFields();});
  $('#page-empresas .page-head .primary-btn').addEventListener('click',addCompany);
  $('#saveSettings').addEventListener('click',saveCompanySettings);
  $('#addPhonePrice').addEventListener('click',addPhoneTariff);
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
async function exportCsv(report=false) {
  const rows=report?getReportRows():filteredNotices(false);
  const columns=['Recibido','Estado','Cliente','Teléfono','Correo','Landing','Aparato','Categoría','Localidad','Código postal','Marca','Avería','Importe',...fields.filter(f=>f.visible_in_table).map(f=>f.label)];
  const csv=[columns,...rows.map(n=>[formatDate(n.received_at),statusLabel(n.status),n.customer_name,n.phone,n.email||'',landingName(n.landing_id),n.device||'',n.category||'',n.locality||'',n.postal_code||'',n.brand||'',n.issue||'',n.status==='Sale'?n.unit_price:'',...fields.filter(f=>f.visible_in_table).map(f=>n.custom_fields?.[f.field_key]??n[f.field_key]??'')])].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='avisos-'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(a.href);
}
document.addEventListener('DOMContentLoaded',()=>{wireUI();openAuth();if(!db)return;db.auth.getSession().then(({data,error})=>{if(error){$('#authError').textContent=errorText(error);return;}if(data.session){user=data.session.user;loadMemberships().catch(e=>{const message=showMembershipLoadError(e);if($('#authError'))$('#authError').textContent=message;});}});db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session){user=session.user;setTimeout(()=>loadMemberships().catch(e=>{const message=showMembershipLoadError(e);if($('#authError'))$('#authError').textContent=message;openAuth();}),0);}if(event==='SIGNED_OUT'){user=null;location.reload();}});});

