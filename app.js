const SUPABASE_URL = "https://omutlsktpgxdfljubaqe.supabase.co";
const SUPABASE_KEY = "sb_publishable_3nUWgphYRap3QfhD2glYqQ_WgiS2pqx";

let session=null, profile=null, jobs=[], requests=[], updates=[], personnelList=[], equipmentList=[], selectedJobId=null, selectedId=null, calendarDate=new Date(), selectedDay=null;

window.onerror=function(msg,url,line){
  const box=document.getElementById("error");
  box.style.display="block";
  box.textContent="App error: "+msg+" line "+line;
};

function rest(table, extra){return SUPABASE_URL+"/rest/v1/"+encodeURIComponent(table)+(extra||"");}
function authUrl(path){return SUPABASE_URL+"/auth/v1/"+path;}
function headers(extra){let h={"apikey":SUPABASE_KEY,"Authorization":"Bearer "+(session?session.access_token:SUPABASE_KEY),"Content-Type":"application/json"}; if(extra) Object.assign(h, extra); return h;}
async function refreshSession(){
  if(!session || !session.refresh_token) return false;
  try{
    let res=await fetch(authUrl("token?grant_type=refresh_token"),{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:session.refresh_token})});
    let data=await res.json();
    if(!res.ok) throw new Error(data.error_description||data.msg||JSON.stringify(data));
    session=data; localStorage.setItem("sb_session",JSON.stringify(session)); return true;
  }catch(e){return false;}
}
async function apiFetch(url, options={}){
  options.headers=options.headers||headers();
  let res=await fetch(url,options);
  if(res.status===401){
    if(await refreshSession()){
      const prefer=options.headers["Prefer"];
      options.headers=headers(prefer?{"Prefer":prefer}:undefined);
      res=await fetch(url,options);
    }
  }
  return res;
}
function startSessionAutoRefresh(){ if(window.__sessionRefreshTimer) clearInterval(window.__sessionRefreshTimer); window.__sessionRefreshTimer=setInterval(refreshSession,10*60*1000); }
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function fmt(dt){if(!dt)return"No due date";let d=new Date(dt);return isNaN(d)?"No due date":d.toLocaleString();}
function dateOnly(dt){if(!dt)return"";let d=new Date(dt);return isNaN(d)?"":d.toISOString().slice(0,10);}
function dateKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function toLocalDateTime(v){if(!v)return"";let d=new Date(v);if(isNaN(d))return"";let z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,16);}
function status(s){syncStatus.textContent=s;}
function currentReq(){return requests.find(r=>r.id===selectedId)||null;}
function currentJob(){return jobs.find(j=>j.id===selectedJobId)||null;}
function canEdit(){return profile && ["admin","standard","viewer","manager","crew_lead"].includes(profile.role);}
function canDelete(){return profile && profile.role==="admin";}
function canEditJobs(){return profile && profile.role==="admin";}
function actorEmail(){return session?.user?.email||"unknown";}
function isActiveRequest(r){return !["Complete","Closed"].includes(r.status);}
function statusClass(s){return {New:"statusNew",Assigned:"statusAssigned","In Progress":"statusProgress",Waiting:"statusWaiting",Complete:"statusComplete",Closed:"statusClosed"}[s]||"";}
function workTitle(r){
  let note=String(r.description||"").trim();
  if(note){let first=note.split("\n").find(x=>x.trim())||note; return first.length>70?first.slice(0,70)+"…":first;}
  if(r.department==="Mechanic" && r.equipment_name) return "Maintenance: "+r.equipment_name;
  if(r.equipment_name) return r.equipment_name;
  return (r.department||"Work")+" Request";
}
function isAssignedToCurrentUser(r){
  if(!profile||!r) return false;
  const email=String(session?.user?.email||"").toLowerCase();
  const person=String(profile.full_name||"").toLowerCase();
  const dept=String(profile.department||"").toLowerCase();
  if(person && String(r.personnel||"").toLowerCase()===person) return true;
  if(dept && String(r.department||"").toLowerCase()===dept) return true;
  if(email && String(r.created_by_email||"").toLowerCase()===email) return true;
  return false;
}
function shouldShowInRightWorkList(r){
  if(!profile||!r) return false;
  if(profile.role==="admin"||profile.role==="manager") return isActiveRequest(r);
  return isActiveRequest(r)&&isAssignedToCurrentUser(r);
}
function canSeeRequest(r){
  if(!profile) return false;
  if(profile.role==="admin"||profile.role==="manager") return true;
  return isAssignedToCurrentUser(r);
}
function canCompleteRequest(r){ if(!r||!profile) return false; if(profile.role==="admin") return true; return canSeeRequest(r); }
function canSeeJob(j){
  if(!profile||!j) return false;
  if(profile.role==="admin"||profile.role==="manager") return true;
  return requests.some(r=>r.job_id===j.id && canSeeRequest(r));
}
function normalizeJob(j){return {id:j.id,sort_order:j.sort_order??9999,name:j.name||"Untitled Job",address:j.address||"",owner:j.owner||"",site_contact:j.site_contact||"",dirt_start:j.dirt_start||"",dirt_end:j.dirt_end||"",utilities_start:j.utilities_start||"",utilities_end:j.utilities_end||"",dropbox_link:j.dropbox_link||"",notes:j.notes||"",updated_at:j.updated_at};}
function normalizeReq(r){return {id:r.id,job_id:r.job_id||"",job:r.job||"",department:r.department||"Survey",priority:r.priority||"Medium",status:r.status||"New",due_at:r.due_at||"",personnel:r.personnel||"",equipment_id:r.equipment_id||"",equipment_name:r.equipment_name||"",mechanic_severity:r.mechanic_severity||"",can_operate:r.can_operate||"",dropbox_link:r.dropbox_link||"",description:r.description||"",created_by_email:r.created_by_email||"",created_at:r.created_at,updated_at:r.updated_at};}

async function signIn(){
  try{
    let res=await fetch(authUrl("token?grant_type=password"),{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:authEmail.value.trim(),password:authPassword.value})});
    let data=await res.json();
    if(!res.ok) throw new Error(data.error_description||data.msg||JSON.stringify(data));
    session=data; localStorage.setItem("sb_session",JSON.stringify(session)); startSessionAutoRefresh(); await loadProfile(); setViews(); await loadAll();
  }catch(e){alert("Sign in failed: "+e.message);}
}
async function signUp(){
  try{
    let res=await fetch(authUrl("signup"),{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:authEmail.value.trim(),password:authPassword.value})});
    let data=await res.json(); if(!res.ok) throw new Error(data.error_description||data.msg||JSON.stringify(data));
    alert("Signup created. If confirmation is required, check email, then sign in.");
  }catch(e){alert("Signup failed: "+e.message);}
}
function logout(){session=null;profile=null;if(window.__sessionRefreshTimer) clearInterval(window.__sessionRefreshTimer);localStorage.removeItem("sb_session");setViews();status("Signed out.");}
async function loadProfile(){let res=await apiFetch(rest("profiles","?select=*&id=eq."+session.user.id),{headers:headers()});let data=await res.json();profile=data[0]||{role:"standard",department:"",full_name:""};}
function setViews(){authView.classList.toggle("hidden",!!session);mainView.classList.toggle("hidden",!session);topButtons.classList.toggle("hidden",!session);if(session){signedInName.textContent=session.user.email;roleBadge.textContent=profile?.role||"unknown";assignWorkBtn.disabled=!canEdit();newJobBtn.disabled=!canEditJobs();}}

async function loadAll(){await Promise.all([loadPersonnel(),loadEquipment(),loadJobs(),loadRequests()]);renderAll();status("Loaded.");}
async function loadPersonnel(){let res=await apiFetch(rest("personnel","?select=*&active=eq.true&order=full_name.asc"),{headers:headers()});let data=await res.json();personnelList=Array.isArray(data)?data:[];personnel.innerHTML='<option></option>'+personnelList.map(p=>`<option>${esc(p.full_name)}</option>`).join("");}
async function loadEquipment(){let res=await apiFetch(rest("equipment","?select=*&status=eq.Active&order=name.asc"),{headers:headers()});let data=await res.json();equipmentList=Array.isArray(data)?data:[];renderEquipmentOptions();}
async function loadJobs(){let res=await apiFetch(rest("JOBS","?select=*&order=sort_order.asc,updated_at.desc"),{headers:headers()});let data=await res.json();jobs=(data||[]).map(normalizeJob);if(!selectedJobId&&jobs[0])selectedJobId=jobs[0].id;}
async function loadRequests(){let res=await apiFetch(rest("REQUESTS","?select=*&order=updated_at.desc"),{headers:headers()});let data=await res.json();if(!res.ok)throw new Error(JSON.stringify(data));requests=(data||[]).map(normalizeReq);}
async function loadUpdates(id){let res=await apiFetch(rest("request_updates","?select=*&request_id=eq."+id+"&order=created_at.desc"),{headers:headers()});let data=await res.json();updates=Array.isArray(data)?data:[];}

function ensureVisibleSelectedJob(){if(!selectedJobId||!jobs.find(j=>j.id===selectedJobId&&canSeeJob(j))){const first=jobs.find(canSeeJob);selectedJobId=first?first.id:null;}}
function renderAll(){ensureVisibleSelectedJob();renderJobs();renderRequests();renderCalendar();renderDayList();renderFeed();populateJobSelect();if(!jobDrawer.classList.contains("hidden"))renderJobOverview();}
function renderJobs(){let q=jobSearch.value.toLowerCase();let arr=jobs.filter(j=>canSeeJob(j)&&JSON.stringify(j).toLowerCase().includes(q));jobList.innerHTML=arr.length?arr.map(j=>`<div class="item ${j.id===selectedJobId?"active":""}" data-job-id="${esc(j.id)}" draggable="true"><div class="title">${esc(j.name)}</div><div class="meta">Dirt: ${esc(j.dirt_start||"—")} → ${esc(j.dirt_end||"—")}</div><div class="meta">${requests.filter(r=>canSeeRequest(r)&&isActiveRequest(r)&&r.job_id===j.id).length} Active Work</div><div class="dragHint">Drag to reorder</div></div>`).join(""):`<div class="muted">No jobs yet.</div>`;
  document.querySelectorAll("[data-job-id]").forEach(el=>{
    el.onclick=()=>{if(window.__draggingJob)return;selectedJobId=el.dataset.jobId;renderAll();if(jobDrawer.classList.contains("hidden"))openJobDrawer(selectedJobId);else refreshJobDrawer();};
    el.addEventListener("dragstart",e=>{window.__draggingJob=el.dataset.jobId;el.classList.add("dragging");e.dataTransfer.effectAllowed="move";});
    el.addEventListener("dragend",()=>{el.classList.remove("dragging");setTimeout(()=>window.__draggingJob=null,50);});
    el.addEventListener("dragover",e=>{e.preventDefault();});
    el.addEventListener("drop",async e=>{e.preventDefault();const from=window.__draggingJob,to=el.dataset.jobId;if(from&&to&&from!==to)await reorderJobsByDrop(from,to);});
  });
}
async function reorderJobsByDrop(fromId,toId){if(!canEditJobs())return alert("No permission to rearrange jobs.");const visible=jobs.filter(canSeeJob);const from=visible.findIndex(j=>j.id===fromId),to=visible.findIndex(j=>j.id===toId);if(from<0||to<0)return;const [moved]=visible.splice(from,1);visible.splice(to,0,moved);for(let i=0;i<visible.length;i++)visible[i].sort_order=i+1;for(const j of visible){await apiFetch(rest("JOBS","?id=eq."+j.id),{method:"PATCH",headers:headers(),body:JSON.stringify({sort_order:j.sort_order,updated_at:new Date().toISOString()})});}await loadJobs();renderAll();}
function filteredRequests(){let q=search.value.toLowerCase(),dept=deptFilter.value,stat=statusFilter.value;return requests.filter(r=>canSeeRequest(r)&&JSON.stringify(r).toLowerCase().includes(q)&&(dept==="All"||r.department===dept)&&(((stat==="Active Work"||stat==="Active")&&shouldShowInRightWorkList(r))||stat==="All Work"||stat==="All"||r.status===stat));}
function renderRequests(){let list=filteredRequests();requestList.innerHTML=list.length?list.map(r=>`<div class="request ${statusClass(r.status)} ${r.id===selectedId?"active":""}" data-id="${esc(r.id)}"><div class="requestTitle">${esc(workTitle(r))}</div><div class="meta">${esc(r.department)} • <span class="badge ${esc(r.priority)}">${esc(r.priority)}</span> • ${esc(r.status)}</div><div class="meta">Due: ${esc(fmt(r.due_at))}</div><div class="meta">Assigned to: ${esc(r.department)}${r.personnel?" / "+esc(r.personnel):""}${r.equipment_name?" • Equip: "+esc(r.equipment_name):""}</div>${r.department==="Mechanic"?`<div class="meta">Severity: ${esc(r.mechanic_severity||"Normal")} • Can operate: ${esc(r.can_operate||"Unknown")}</div>`:""}</div>`).join(""):`<div class="muted">No active work assigned to you.</div>`;document.querySelectorAll("#requestList .request").forEach(el=>el.onclick=()=>openRequestDrawer(el.dataset.id));}

function renderEquipmentOptions(){if(!document.getElementById("equipment"))return;equipment.innerHTML='<option></option>'+equipmentList.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("");}
function toggleEquipmentField(){let show=department.value==="Mechanic"||department.value==="Mobilization";equipmentWrap.classList.toggle("hidden",!show);mechanicWrap.classList.toggle("hidden",department.value!=="Mechanic");if(!show)equipment.value="";renderEquipmentOptions();}
function selectedEquipmentName(){let e=equipmentList.find(x=>x.id===equipment.value);return e?e.name:"";}
function updateProgressiveForm(){let hasDepartment=!!department.value;assignedStep.classList.toggle("hidden",!hasDepartment);remainingSteps.classList.toggle("hidden",!hasDepartment);formHint.classList.toggle("hidden",hasDepartment);formHint.textContent="Select who this work is assigned to.";if(department.value==="Mechanic"){descriptionLabel.textContent="Maintenance Note";description.placeholder="Describe the problem clearly. Example: leaking hydraulic fluid near left track, machine still running but weak.";}else if(department.value==="Mobilization"){descriptionLabel.textContent="Move / Mobilization Details";description.placeholder="What needs moved, from where, to where, and when?";}else if(department.value==="Trucks"){descriptionLabel.textContent="Hauling / Delivery Details";description.placeholder="What needs hauled or delivered? Include source, destination, quantity if known.";}else{descriptionLabel.textContent="Description";description.placeholder="What needs to happen? Include location/details.";}toggleEquipmentField();}
function populateJobSelect(){const visible=jobs.filter(canSeeJob);requestJobSelect.innerHTML='<option value="">No specific job</option>'+visible.map(j=>`<option value="${esc(j.id)}">${esc(j.name)}</option>`).join("");if(selectedJobId&&visible.some(j=>j.id===selectedJobId))requestJobSelect.value=selectedJobId;}
function clearRequestForm(){populateJobSelect();department.value="";requestJobSelect.value="";priority.value="Medium";requestStatus.value="New";dueAt.value="";personnel.value="";equipment.value="";mechanicSeverity.value="Normal";canOperate.value="Unknown";dropboxLink.value="";description.value="";updateProgressiveForm();}
function setRequestForm(r){populateJobSelect();if(!r){clearRequestForm();deleteBtn.disabled=true;saveEditBtn.disabled=true;addUpdateBtn.disabled=true;completeBtn.disabled=true;sendBtn.disabled=!canEdit();return;}requestJobSelect.value=r.job_id||"";department.value=r.department||"Survey";priority.value=r.priority||"Medium";requestStatus.value=r.status||"New";dueAt.value=toLocalDateTime(r.due_at||"");personnel.value=r.personnel||"";toggleEquipmentField();equipment.value=r.equipment_id||"";mechanicSeverity.value=r.mechanic_severity||"Normal";canOperate.value=r.can_operate||"Unknown";dropboxLink.value=r.dropbox_link||"";description.value=r.description||"";deleteBtn.disabled=!canDelete();saveEditBtn.disabled=!canEdit();sendBtn.disabled=true;addUpdateBtn.disabled=!canEdit();completeBtn.disabled=!canCompleteRequest(r);updateProgressiveForm();}
function getRequestForm(){let jid=requestJobSelect.value||null;let j=jobs.find(x=>x.id===jid);let eqName=(department.value==="Mechanic"||department.value==="Mobilization")?selectedEquipmentName():"";return {job_id:jid,job:j?.name||"",department:department.value,priority:priority.value,status:requestStatus.value,due_at:dueAt.value?new Date(dueAt.value).toISOString():null,personnel:personnel.value,equipment_id:(department.value==="Mechanic"||department.value==="Mobilization")?(equipment.value||null):null,equipment_name:eqName,mechanic_severity:department.value==="Mechanic"?mechanicSeverity.value:null,can_operate:department.value==="Mechanic"?canOperate.value:null,dropbox_link:dropboxLink.value,description:description.value};}
async function openRequestDrawer(id=null){selectedId=id;if(id){await loadUpdates(id);setFormMode("details");setRequestForm(currentReq());drawerTitle.textContent="Request Details";}else{updates=[];setFormMode("new");setRequestForm(null);drawerTitle.textContent="Assign Work";feed.innerHTML='<div class="meta">Fill out the form and click Send Request.</div>';}drawer.classList.remove("hidden");renderAll();}
function setFormMode(mode){sendBtn.classList.toggle("hidden",mode!=="new");clearFormBtn.classList.toggle("hidden",mode!=="new");}
function closeDrawer(){drawer.classList.add("hidden");}
async function addUpdate(text,type="update"){let r=currentReq();if(!r)return;let payload={request_id:r.id,update_text:text,action_type:type,created_by:session.user.id,created_by_email:actorEmail()};let res=await apiFetch(rest("request_updates"),{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});if(!res.ok)alert(await res.text());await loadUpdates(r.id);renderFeed();}
async function sendRequest(){if(!canEdit())return alert("No permission.");let data=getRequestForm();if(!data.department)return alert("Select who this is assigned to.");if(data.department==="Mechanic"&&!data.equipment_id)return alert("Select equipment for the maintenance request.");if(!data.description)return alert(data.department==="Mechanic"?"Add a maintenance note.":"Add request description.");let payload={...data,created_by:session.user.id,created_by_email:actorEmail(),updated_by:session.user.id,updated_at:new Date().toISOString()};let res=await apiFetch(rest("REQUESTS"),{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});let out=await res.json();if(!res.ok)return alert(JSON.stringify(out));let created=normalizeReq(out[0]);requests.unshift(created);selectedId=created.id;await addUpdate(created.department==="Mechanic"?"Maintenance request created. Equipment: "+(created.equipment_name||"Not listed")+". Severity: "+(created.mechanic_severity||"Normal")+". Can operate: "+(created.can_operate||"Unknown")+". Note: "+(created.description||""):"Work request created. Assigned to "+created.department+".","created");await loadRequests();status("Work request sent and saved.");drawer.classList.add("hidden");selectedId=null;clearRequestForm();renderAll();}
async function saveEdit(){let r=currentReq();if(!r)return sendRequest();if(!canEdit())return alert("No permission.");let before={...r},data=getRequestForm();let res=await apiFetch(rest("REQUESTS","?id=eq."+r.id),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({...data,updated_by:session.user.id,updated_at:new Date().toISOString()})});let out=await res.json();if(!res.ok)return alert(JSON.stringify(out));Object.assign(r,normalizeReq(out[0]));await addUpdate("Request saved.","change");await loadRequests();renderAll();status("Saved.");}
async function completeWork(){let r=currentReq();if(!r)return alert("Select a request.");if(!canCompleteRequest(r))return alert("No permission.");if(!confirm("Mark this assigned work complete?"))return;let res=await apiFetch(rest("REQUESTS","?id=eq."+r.id),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({status:"Complete",updated_by:session.user.id,updated_at:new Date().toISOString()})});let out=await res.json();if(!res.ok)return alert(JSON.stringify(out));Object.assign(r,normalizeReq(out[0]));await addUpdate("Marked work complete and moved to completed/catalogued history.","complete");await loadRequests();await openRequestDrawer(r.id);status("Work completed.");}
async function addManualUpdate(){let r=currentReq();if(!r)return alert("Select a request.");let text=prompt("Update:");if(!text)return;await addUpdate(text,"update");}
async function deleteRequest(){let r=currentReq();if(!r||!canDelete())return;if(!confirm("Delete request?"))return;let res=await apiFetch(rest("REQUESTS","?id=eq."+r.id),{method:"DELETE",headers:headers()});if(!res.ok)return alert(await res.text());requests=requests.filter(x=>x.id!==r.id);selectedId=null;closeDrawer();renderAll();}

function openJobDrawer(id=null){selectedJobId=id||null;let j=currentJob();jobDrawerTitle.textContent=j?"Job Overview":"New Job";refreshJobDrawer();jobDrawer.classList.remove("hidden");}
function refreshJobDrawer(){let j=currentJob();jobNameInput.value=j?.name||"";jobAddressInput.value=j?.address||"";jobOwnerInput.value=j?.owner||"";jobSiteContactInput.value=j?.site_contact||"";dirtStartInput.value=dateOnly(j?.dirt_start||"");dirtEndInput.value=dateOnly(j?.dirt_end||"");utilitiesStartInput.value=dateOnly(j?.utilities_start||"");utilitiesEndInput.value=dateOnly(j?.utilities_end||"");jobDropboxInput.value=j?.dropbox_link||"";jobNotesInput.value=j?.notes||"";deleteJobBtn.disabled=!canDelete()||!j;saveJobBtn.disabled=!canEditJobs();renderJobOverview();}
function renderJobOverview(){let j=currentJob();if(!j){jobOverviewStats.innerHTML="Create or select a job.";jobRequestsList.innerHTML="No active work yet.";jobLatestActivity.innerHTML="No history yet.";return;}let allReqs=requests.filter(r=>canSeeRequest(r)&&r.job_id===j.id);let reqs=allReqs.filter(isActiveRequest);let critical=reqs.filter(r=>r.priority==="Critical").length;let overdue=reqs.filter(r=>r.due_at&&new Date(r.due_at)<new Date()).length;jobOverviewStats.innerHTML=`<div class="three"><div><span class="badge">Total Work: ${allReqs.length}</span></div><div><span class="badge">Active: ${reqs.length}</span></div><div><span class="badge Critical">Critical: ${critical}</span></div></div><div class="meta" style="margin-top:8px;">Address: ${esc(j.address||"—")}<br>Owner: ${esc(j.owner||"—")} • Site Contact: ${esc(j.site_contact||"—")}<br>Dirt: ${esc(j.dirt_start||"—")} → ${esc(j.dirt_end||"—")} • Utilities: ${esc(j.utilities_start||"—")} → ${esc(j.utilities_end||"—")} • Overdue Work: ${overdue}</div>`;jobRequestsList.innerHTML=reqs.length?reqs.map(r=>`<div class="request ${statusClass(r.status)}" data-job-req="${esc(r.id)}"><div class="requestTitle">${esc(workTitle(r))}</div><div class="meta"><span class="badge ${esc(r.priority)}">${esc(r.priority)}</span> • ${esc(r.status)} • Due: ${esc(fmt(r.due_at))}</div>${r.department==="Mechanic"?`<div class="meta">Equipment: ${esc(r.equipment_name||"—")} • Severity: ${esc(r.mechanic_severity||"Normal")} • Can operate: ${esc(r.can_operate||"Unknown")}</div>`:""}<div class="meta">${esc(r.description||"No description").slice(0,220)}</div></div>`).join(""):`<div class="muted">No active work. Click “Assign Work to This Job” to create one.</div>`;jobRequestsList.querySelectorAll("[data-job-req]").forEach(el=>el.onclick=()=>openRequestDrawer(el.dataset.jobReq));let latest=allReqs.slice().sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0)).slice(0,5);jobLatestActivity.innerHTML=latest.length?latest.map(r=>`<div class="feedItem"><div class="meta"><b>${esc(r.department)}</b> • ${esc(r.status)} • ${esc(fmt(r.updated_at))}</div><div>${esc(workTitle(r))}</div></div>`).join(""):`<div class="muted">No history yet.</div>`;}
function switchJob(step){if(!jobs.length)return;let visible=jobs.filter(canSeeJob);let idx=visible.findIndex(j=>j.id===selectedJobId);if(idx<0)idx=0;idx=(idx+step+visible.length)%visible.length;selectedJobId=visible[idx].id;renderAll();refreshJobDrawer();}
async function saveJob(){if(!canEditJobs())return alert("No permission to edit jobs.");let j=currentJob();let payload={name:jobNameInput.value||"Untitled Job",address:jobAddressInput.value,owner:jobOwnerInput.value,site_contact:jobSiteContactInput.value,dirt_start:dirtStartInput.value||null,dirt_end:dirtEndInput.value||null,utilities_start:utilitiesStartInput.value||null,utilities_end:utilitiesEndInput.value||null,dropbox_link:jobDropboxInput.value,notes:jobNotesInput.value,sort_order:(j?.sort_order??jobs.length),updated_by:session.user.id,updated_at:new Date().toISOString()};let res;if(j)res=await apiFetch(rest("JOBS","?id=eq."+j.id),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});else res=await apiFetch(rest("JOBS"),{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({...payload,created_by:session.user.id})});let out=await res.json();if(!res.ok)return alert(JSON.stringify(out));await loadJobs();selectedJobId=out[0].id;jobDrawer.classList.add("hidden");renderAll();}
async function deleteJob(){let j=currentJob();if(!j||!canDelete())return;if(!confirm("Delete job?"))return;let res=await apiFetch(rest("JOBS","?id=eq."+j.id),{method:"DELETE",headers:headers()});if(!res.ok)return alert(await res.text());jobs=jobs.filter(x=>x.id!==j.id);selectedJobId=jobs[0]?.id||null;jobDrawer.classList.add("hidden");renderAll();}

function renderFeed(){if(drawer.classList.contains("hidden"))return;feed.innerHTML=updates.length?updates.map(u=>`<div class="feedItem"><div class="meta"><b>${esc(u.created_by_email||"Unknown")}</b> • ${esc(fmt(u.created_at))}</div><div>${esc(u.update_text)}</div></div>`).join(""):`<div class="meta">No updates yet.</div>`;}
function renderCalendar(){let y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0);calendarTitle.textContent=first.toLocaleDateString(undefined,{month:"long",year:"numeric"});let by={};requests.filter(r=>canSeeRequest(r)&&isActiveRequest(r)).forEach(r=>{if(r.due_at){let key=dateKey(new Date(r.due_at));by[key]=by[key]||[];by[key].push(r);}});let names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];let out=`<div class="calendarGrid">${names.map(n=>`<div class="dayName">${n}</div>`).join("")}`;for(let i=0;i<first.getDay();i++)out+=`<div class="day empty"></div>`;let today=dateKey(new Date());for(let d=1;d<=last.getDate();d++){let key=dateKey(new Date(y,m,d)),events=by[key]||[];out+=`<div class="day ${key===today?"today":""} ${key===selectedDay?"selected":""}" data-day="${key}"><div class="dateNum">${d}</div>${events.slice(0,4).map(e=>`<div class="event ${esc(e.priority)}">${esc(workTitle(e))}</div>`).join("")}</div>`;}out+=`</div>`;calendar.innerHTML=out;document.querySelectorAll("[data-day]").forEach(el=>el.onclick=()=>{selectedDay=el.dataset.day;renderAll();});}
function renderDayList(){if(!selectedDay){selectedDayTitle.textContent="Selected Day";dayList.innerHTML="Click a date to see active work due that day.";return;}selectedDayTitle.textContent="Due "+new Date(selectedDay+"T00:00:00").toLocaleDateString();let matches=requests.filter(r=>canSeeRequest(r)&&isActiveRequest(r)&&r.due_at&&dateKey(new Date(r.due_at))===selectedDay);dayList.innerHTML=matches.length?matches.map(r=>`<div class="request ${statusClass(r.status)}" data-id="${esc(r.id)}"><div class="requestTitle">${esc(workTitle(r))}</div><div class="meta">${esc(r.department)} • <span class="badge ${esc(r.priority)}">${esc(r.priority)}</span> • ${esc(r.status)}</div></div>`).join(""):"Nothing due this day.";dayList.querySelectorAll(".request").forEach(el=>el.onclick=()=>openRequestDrawer(el.dataset.id));}

signInBtn.onclick=signIn;signUpBtn.onclick=signUp;logoutBtn.onclick=logout;refreshBtn.onclick=loadAll;newJobBtn.onclick=()=>openJobDrawer(null);assignWorkBtn.onclick=async()=>{selectedId=null;await openRequestDrawer(null);requestJobSelect.value="";};closeDrawerBtn.onclick=closeDrawer;closeJobDrawerBtn.onclick=()=>jobDrawer.classList.add("hidden");prevJobBtn.onclick=()=>switchJob(-1);nextJobBtn.onclick=()=>switchJob(1);jobAssignWorkBtn.onclick=async()=>{await openRequestDrawer(null);requestJobSelect.value=selectedJobId||"";};jobOpenDropboxBtn.onclick=()=>{let j=currentJob();if(j?.dropbox_link)window.open(j.dropbox_link,"_blank");};department.onchange=updateProgressiveForm;requestJobSelect.onchange=updateProgressiveForm;clearFormBtn.onclick=()=>{selectedId=null;clearRequestForm();feed.innerHTML='<div class="meta">Form cleared.</div>';};sendBtn.onclick=sendRequest;completeBtn.onclick=completeWork;saveEditBtn.onclick=saveEdit;addUpdateBtn.onclick=addManualUpdate;deleteBtn.onclick=deleteRequest;saveJobBtn.onclick=saveJob;deleteJobBtn.onclick=deleteJob;search.oninput=renderRequests;deptFilter.onchange=renderRequests;statusFilter.onchange=renderRequests;jobSearch.oninput=renderJobs;prevMonth.onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1);renderCalendar();};nextMonth.onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1);renderCalendar();};todayBtn.onclick=()=>{calendarDate=new Date();selectedDay=dateKey(new Date());renderAll();};
jobDrawer.addEventListener("click",e=>{if(e.target===jobDrawer)jobDrawer.classList.add("hidden");});drawer.addEventListener("click",e=>{if(e.target===drawer)drawer.classList.add("hidden");});

try{session=JSON.parse(localStorage.getItem("sb_session")||"null");}catch(e){session=null;}
if(session){startSessionAutoRefresh();loadProfile().then(()=>{setViews();loadAll();}).catch(logout);}else setViews();
