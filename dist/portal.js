
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
   button.hidden=ADMIN_PORTAL||(key==='cobros'?!companyHasWorkFinance():!tenantModuleEnabled(key));
  }
 });
 const mainLabel=document.querySelector('.sidebar .nav-label');if(mainLabel)mainLabel.hidden=ADMIN_PORTAL;
 const mobile=document.querySelector('#mobileNav');if(mobile)mobile.hidden=ADMIN_PORTAL;
 if(ADMIN_PORTAL){document.querySelectorAll('.sidebar [data-admin-only]').forEach(el=>el.hidden=false);}
};
const originalShowPage=showPage;
showPage=function(name){
 const operational=MODULE_CATALOG.some(m=>m[0]===name)||name==='cobros';
 if(ADMIN_PORTAL&&operational){originalShowPage('empresas');return;}
 if(!ADMIN_PORTAL&&operational&&!tenantModuleEnabled(name)){toast('Este bloque no está habilitado para tu empresa.');return;}
 originalShowPage(name);
 if(ADMIN_PORTAL){
  document.title='Superadministración · CRM Gestión de avisos';
  const head=document.querySelector('.page.active .page-head');
  if(head&&name!=='empresas'&&!head.querySelector('[data-return-admin]')){
   const b=document.createElement('button');b.type='button';b.className='outline-btn';b.dataset.returnAdmin='true';b.textContent='Volver al panel central';b.onclick=()=>showPage('empresas');head.append(b);
  }
  renderCompanyPicker();
 }
};
const originalRenderCompanies=renderCompanyPage;
renderCompanyPage=function(){
 originalRenderCompanies();
 if(!ADMIN_PORTAL)return;
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
 });
};
const originalCompanyBrand=renderCompanyBrand;
renderCompanyBrand=function(){
 if(!ADMIN_PORTAL){originalCompanyBrand();return;}
 const brand=document.querySelector('.brand');if(brand)brand.innerHTML='<div class="brand-mark">A</div><div><strong>Superadministración</strong><small>Administración central</small></div>';
};
const originalCompanyTheme=applyCompanyTheme;
applyCompanyTheme=function(color){originalCompanyTheme(ADMIN_PORTAL?'#5267e8':color);};
const originalCompanyPicker=renderCompanyPicker;
renderCompanyPicker=function(){
 if(!ADMIN_PORTAL){originalCompanyPicker();return;}
 const el=document.querySelector('.company-select');if(el){el.hidden=false;el.innerHTML='<span class="company-badge">A</span><span>'+esc(currentCompany?'Configurando: '+currentCompany.name:'Administración global')+'</span>';el.onclick=()=>showPage('empresas');}
 renderCompanyBrand();
};
document.addEventListener('DOMContentLoaded',()=>{
 if(!ADMIN_PORTAL)return;
 const title=document.querySelector('#authScreen h1');if(title)title.textContent='Acceso de superadministrador';
 const text=document.querySelector('#authScreen p');if(text)text.textContent='Administración central de empresas, bloques y configuración.';
 const signup=document.querySelector('#authSwitch');if(signup)signup.hidden=true;
});
