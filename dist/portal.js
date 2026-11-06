
let adminOperatingCompany=false;
const MODULE_CATALOG=[
 ['avisos-landing','Avisos por formulario y landing'],['avisos-phone','Avisos por teléfono'],
 ['reclamaciones','Reclamaciones'],['anulaciones','Anulaciones'],['historial','Historial de clientes'],
 ['agenda','Agenda y citas'],['informes','Informes operativos']
];
function tenantModuleEnabled(key){return currentCompany?.enabled_modules?.[key]!==false;}
const originalModuleVisibility=applyCompanyModules;
applyCompanyModules=function(){
 originalModuleVisibility();
 document.querySelectorAll('[data-page]').forEach(button=>{
  const key=button.dataset.page;
  if(MODULE_CATALOG.some(m=>m[0]===key)||key==='cobros'){
   button.hidden=(ADMIN_PORTAL&&!adminOperatingCompany)||(key==='cobros'?!companyHasWorkFinance():!tenantModuleEnabled(key));
  }
 });
 const mainLabel=document.querySelector('.sidebar .nav-label');if(mainLabel)mainLabel.hidden=ADMIN_PORTAL&&!adminOperatingCompany;
 const mobile=document.querySelector('#mobileNav');if(mobile)mobile.hidden=ADMIN_PORTAL&&!adminOperatingCompany;
 if(ADMIN_PORTAL){document.querySelectorAll('.sidebar [data-admin-only]').forEach(el=>el.hidden=adminOperatingCompany);document.querySelectorAll('[data-page]').forEach(el=>{if(['empresas','usuarios','personalizacion','configuracion','integraciones'].includes(el.dataset.page))el.hidden=adminOperatingCompany;});}
};
const originalShowPage=showPage;
showPage=function(name){
 const operational=MODULE_CATALOG.some(m=>m[0]===name)||name==='cobros';
 if(ADMIN_PORTAL&&operational&&!adminOperatingCompany){originalShowPage('empresas');return;}
 if(ADMIN_PORTAL&&adminOperatingCompany&&operational&&name!=='cobros'&&!tenantModuleEnabled(name)){toast('Este bloque no está habilitado para esta empresa.');return;}
 if(ADMIN_PORTAL&&adminOperatingCompany&&name==='cobros'&&!companyHasWorkFinance()){toast('La facturación y los cobros por trabajo están desactivados para esta empresa.','Bloque desactivado');return;}
 if(!ADMIN_PORTAL&&operational&&!tenantModuleEnabled(name)){toast('Este bloque no está habilitado para tu empresa.');return;}
 originalShowPage(name);
 if(ADMIN_PORTAL){
  document.title=adminOperatingCompany&&currentCompany?currentCompany.name+' · CRM Gestión de avisos':'Superadministración · CRM Gestión de avisos';
  const head=document.querySelector('.page.active .page-head');
  if(head&&name!=='empresas'&&!head.querySelector('[data-return-admin]')){
   const b=document.createElement('button');b.type='button';b.className='outline-btn';b.dataset.returnAdmin='true';b.textContent='Volver al panel central';b.onclick=returnToSuperadminPanel;head.append(b);
  }
  renderCompanyPicker();
 }
};
const originalRenderCompanies=renderCompanyPage;
renderCompanyPage=function(){
 originalRenderCompanies();
 if(!ADMIN_PORTAL)return;
 if(!adminOperatingCompany){const intro=document.querySelector('#page-empresas .page-head p');if(intro)intro.textContent='Elige el panel de superadministrador o entra en una empresa. Usa tu mismo usuario y contraseña para todas.';}
 const cards=document.querySelectorAll('#page-empresas .simple-grid > .placeholder-tile');
 cards.forEach((card,index)=>{
  const company=companies[index];if(!company)return;
  const box=document.createElement('div');box.style.cssText='display:grid;gap:9px;border-top:1px solid var(--line);padding-top:12px';
  const title=document.createElement('strong');title.textContent='Bloques habilitados';box.append(title);
  MODULE_CATALOG.forEach(([key,label])=>{
   const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;gap:8px;font-size:12px';
   const input=document.createElement('input');input.type='checkbox';input.checked=company.enabled_modules?.[key]!==false;
   input.onchange=async()=>{
    input.disabled=true;const before=!input.checked;
    const enabled_modules={...(company.enabled_modules||{}),[key]:input.checked};
    try{
     const result=await db.from('companies').update({enabled_modules}).eq('id',company.id).select().single();
     if(result.error)throw result.error;Object.assign(company,result.data);
     if(currentCompany?.id===company.id)Object.assign(currentCompany,result.data);
     toast('Bloques de '+company.name+' actualizados.');
    }catch(error){input.checked=before;toast(errorText(error),'No se pudo guardar');}
    finally{input.disabled=false;}
   };
   row.append(input,document.createTextNode(label));box.append(row);
  });
  card.append(box);
  const enter=document.createElement('button');enter.type='button';enter.className='primary-btn';enter.textContent='Entrar en esta empresa';enter.style.cssText='margin-top:12px';
  enter.onclick=async()=>{adminOperatingCompany=true;currentCompany=company;await loadCompanyData();applyAccessPermissions();applyCompanyModules();renderCompanyPicker();const first=MODULE_CATALOG.find(item=>tenantModuleEnabled(item[0]));if(first)showPage(first[0]);else if(companyHasWorkFinance())showPage('cobros');else{adminOperatingCompany=false;renderCompanyPicker();showPage('empresas');toast('Esta empresa todavía no tiene bloques habilitados.','Sin bloques activos');}};
  card.append(enter);
 });
};
const originalCompanyBrand=renderCompanyBrand;
renderCompanyBrand=function(){
 if(!ADMIN_PORTAL||adminOperatingCompany){originalCompanyBrand();return;}
 const brand=document.querySelector('.brand');if(brand)brand.innerHTML='<div class="brand-mark">A</div><div><strong>Superadministración</strong><small>Administración central</small></div>';
};
const originalCompanyTheme=applyCompanyTheme;
applyCompanyTheme=function(color){originalCompanyTheme(ADMIN_PORTAL?'#5267e8':color);};
const originalCompanyPicker=renderCompanyPicker;
renderCompanyPicker=function(){
 if(!ADMIN_PORTAL){originalCompanyPicker();return;}
 const el=document.querySelector('.company-select');if(el){el.hidden=false;el.innerHTML='<span class="company-badge">'+(adminOperatingCompany&&currentCompany?esc((currentCompany.name||'').slice(0,2).toUpperCase()):'A')+'</span><span>'+esc(adminOperatingCompany&&currentCompany?'Empresa: '+currentCompany.name:currentCompany?'Configurando: '+currentCompany.name:'Administración global')+'</span>';el.onclick=()=>adminOperatingCompany?returnToSuperadminPanel():showPage('empresas');}
 renderCompanyBrand();
 const back=document.querySelector('#adminBackToPanel');if(adminOperatingCompany){if(!back){const b=document.createElement('button');b.id='adminBackToPanel';b.type='button';b.className='outline-btn';b.textContent='Panel superadministrador';b.onclick=returnToSuperadminPanel;document.querySelector('.top-actions')?.prepend(b);}}else back?.remove();
};
document.addEventListener('DOMContentLoaded',()=>{
 if(!ADMIN_PORTAL)return;
 const title=document.querySelector('#authScreen h1');if(title)title.textContent='Acceso de superadministrador';
 const text=document.querySelector('#authScreen p');if(text)text.textContent='Administración central de empresas, bloques y configuración.';
 const signup=document.querySelector('#authSwitch');if(signup)signup.hidden=true;
});
const catalogVisibility=applyCompanyModules;
applyCompanyModules=function(){
 catalogVisibility();if(ADMIN_PORTAL||!currentCompany)return;
 const active=document.querySelector('.page.active')?.id;
 const route=active==='page-avisos'?(noticeSource==='phone'?'avisos-phone':'avisos-landing'):active?.replace('page-','');
 if(route&&MODULE_CATALOG.some(m=>m[0]===route)&&!tenantModuleEnabled(route)){
  const first=MODULE_CATALOG.find(m=>tenantModuleEnabled(m[0]));
  if(first)showPage(first[0]);
  else if(companyHasWorkFinance())showPage('cobros');
  else{document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));let empty=document.querySelector('#page-no-modules');if(!empty){empty=document.createElement('section');empty.id='page-no-modules';empty.className='page';empty.innerHTML='<h1>Sin bloques habilitados</h1><p>El superadministrador debe asignar los bloques de esta empresa.</p>';document.querySelector('.content').append(empty);}empty.classList.add('active');}
 }
};
function reportRecordEnabled(record){
 const key=record.notice_type==='reclamacion'?'reclamaciones':record.notice_type==='anulacion'?'anulaciones':record.landing_id?'avisos-landing':'avisos-phone';
 return tenantModuleEnabled(key);
}
const reportActivityBeforeModules=getReportActivityRows;
getReportActivityRows=function(){return reportActivityBeforeModules().filter(reportRecordEnabled);};
const renderReportBeforeModules=renderReport;
renderReport=function(){
 renderReportBeforeModules();
 const landing=tenantModuleEnabled('avisos-landing'),phone=tenantModuleEnabled('avisos-phone'),claims=tenantModuleEnabled('reclamaciones'),cancellations=tenantModuleEnabled('anulaciones');
 const hideCard=(selector,hide)=>{const card=document.querySelector(selector)?.closest('article');if(card)card.hidden=hide;};
 hideCard('#reportPhoneResults',!phone);hideCard('#reportLandingResults',!landing);hideCard('#reportBestLanding',!landing);
 hideCard('#reportComplaintResults',!claims&&!cancellations);
 const followups=document.querySelectorAll('#reportComplaintResults .report-source-card');if(followups[0])followups[0].hidden=!claims;if(followups[1])followups[1].hidden=!cancellations;
 const title=document.querySelector('#reportComplaintResults')?.closest('article')?.querySelector('h2');if(title)title.textContent=claims&&cancellations?'Reclamaciones y anulaciones':claims?'Reclamaciones':'Anulaciones';
 const filter=document.querySelector('#reportLanding');if(filter)filter.hidden=!landing;
 const foot=document.querySelector('#reportTotal')?.closest('article')?.querySelector('.metric-foot');if(foot)foot.textContent=landing&&phone?'Formulario y teléfono':landing?'Formulario web':phone?'Teléfono':'Sin origen de avisos habilitado';
 const description=document.querySelector('#page-informes .page-head p');if(description)description.textContent='Resultados de los bloques habilitados para esta empresa.';
 document.querySelectorAll('#page-informes .chart-grid').forEach(grid=>{grid.hidden=Array.from(grid.querySelectorAll(':scope > article')).every(card=>card.hidden);grid.style.gridTemplateColumns='repeat(auto-fit,minmax(min(100%,300px),1fr))';});
};

function returnToSuperadminPanel(){
 adminOperatingCompany=false;currentCompany=null;
 applyAccessPermissions();applyCompanyModules();renderCompanyPicker();renderCompanyPage();showPage('empresas');renderCompanyPicker();
}
function syncFixedTariffSettings(){
 const enabled=currentCompany?.show_tariff_reports!==false;
 const phone=document.querySelector('#page-configuracion [data-settings-tab="phone-tariffs"]');
 const landing=document.querySelector('#page-configuracion [data-settings-tab="tariffs"]');
 if(phone)phone.hidden=!enabled;if(landing)landing.hidden=!enabled;
 const phonePanel=document.querySelector('#page-configuracion [data-settings-panel="phone-tariffs"]');
 const landingPanel=document.querySelector('#page-configuracion [data-settings-panel="tariffs"]');
 if(phonePanel)phonePanel.hidden=!enabled;if(landingPanel)landingPanel.hidden=!enabled;
 const active=document.querySelector('#page-configuracion [data-settings-tab].active');
 if(!enabled&&active&&['phone-tariffs','tariffs'].includes(active.dataset.settingsTab))showSettingsTab('phone-fields');
}
const showSettingsWithTariffGate=showSettingsTab;
showSettingsTab=function(name){
 if(currentCompany?.show_tariff_reports===false&&['phone-tariffs','tariffs'].includes(name)){
  toast('Las tarifas fijas están desactivadas para esta empresa.','Apartado deshabilitado');
  showSettingsWithTariffGate('phone-fields');return;
 }
 showSettingsWithTariffGate(name);
};
const showPageWithTariffSettings=showPage;
showPage=function(name){showPageWithTariffSettings(name);if(name==='configuracion')syncFixedTariffSettings();};
