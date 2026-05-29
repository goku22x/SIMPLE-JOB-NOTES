const SUPABASE_URL = "https://omutlsktpgxdfljubaqe.supabase.co";
const SUPABASE_KEY = "sb_publishable_3nUWgphYRap3QfhD2glYqQ_WgiS2pqx";

let session=null, profile=null, jobs=[], requests=[], updates=[], personnelList=[], equipmentList=[], selectedJobId=null, selectedId=null, calendarDate=new Date(), selectedDay=null, currentView="calendar";
let draft = {};

window.onerror=function(msg,url,line){const box=document.getElementById("error");box.style.display="block";box.textContent="App error: "+msg+" line "+line;};


// Compatibility aliases for old phase input names.
function getPhaseInputSafe(id){
  return document.getElementById(id) || {value:""};
}

function rest(table, extra){return SUPABASE_URL+"/rest/v1/"+encodeURIComponent(table)+(extra||"");}
function authUrl(path){return SUPABASE_URL+"/auth/v1/"+path;}
function headers(extra){let h={"apikey":SUPABASE_KEY,"Authorization":"Bearer "+(session?session.access_token:SUPABASE_KEY),"Content-Type":"application/json"};if(extra)Object.assign(h,extra);return h;}
async function refreshSession(){if(!session||!session.refresh_token)return false;try{let res=await fetch(authUrl("token?grant_type=refresh_token"),{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:session.refresh_token})});let data=await res.json();if(!res.ok)throw new Error();session=data;localStorage.setItem("sb_session",JSON.stringify(session));return true;}catch(e){return false;}}
async function apiFetch(url, options={}){options.headers=options.headers||headers();let res=await fetch(url,options);if(res.status===401&&await refreshSession()){const prefer=options.headers["Prefer"];options.headers=headers(prefer?{"Prefer":prefer}:undefined);res=await fetch(url,options);}return res;}
function startSessionAutoRefresh(){if(window.__sessionRefreshTimer)clearInterval(window.__sessionRefreshTimer);window.__sessionRefreshTimer=setInterval(refreshSession,10*60*1000);}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function fmt(dt){if(!dt)return"No due date";let d=new Date(dt);return isNaN(d)?"No due date":d.toLocaleString();}
function dateOnly(dt){if(!dt)return"";let d=new Date(dt);return isNaN(d)?"":d.toISOString().slice(0,10);}
function toLocalDateTime(v){if(!v)return"";let d=new Date(v);if(isNaN(d))return"";let z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,16);}
function dateKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function status(s){syncStatus.textContent=s;}

function openLinkSafe(url){
  let link = String(url || "").trim();
  if(!link) return alert("No Dropbox link saved.");
  if(!/^https?:\/\//i.test(link)) link = "https://" + link;
  window.open(link, "_blank", "noopener,noreferrer");
}

function canEdit(){return profile&&["admin","standard","viewer","manager","crew_lead"].includes(profile.role);}
function canDelete(){return profile&&profile.role==="admin";}
function canEditJobs(){return profile&&profile.role==="admin";}
function actorEmail(){return session?.user?.email||"unknown";}
function isActiveRequest(r){return !["Complete","Closed"].includes(r.status);}
function statusClass(s){return {New:"statusNew",Assigned:"statusAssigned","In Progress":"statusProgress",Waiting:"statusWaiting",Complete:"statusComplete",Closed:"statusClosed"}[s]||"";}
function workTitle(r){let note=String(r.description||"").trim();if(note){let first=note.split("\n").find(x=>x.trim())||note;return first.length>70?first.slice(0,70)+"…":first;}if(r.department==="Mobilization"&&r.equipment_name)return"Move: "+r.equipment_name;if(r.department==="Maintenance"&&r.equipment_name)return"Maintenance: "+r.equipment_name;if(r.equipment_name)return r.equipment_name;return(r.department||"Work")+" Request";}
function isAssignedToCurrentUser(r){if(!profile||!r)return false;const email=String(session?.user?.email||"").toLowerCase();const person=String(profile.full_name||"").toLowerCase();const dept=String(profile.department||"").toLowerCase();if(person&&String(r.personnel||"").toLowerCase()===person)return true;if(dept&&String(r.department||"").toLowerCase()===dept)return true;if(email&&String(r.created_by_email||"").toLowerCase()===email)return true;return false;}
function canSeeRequest(r){if(!profile)return false;if(profile.role==="admin"||profile.role==="manager")return true;return isAssignedToCurrentUser(r);}
function shouldShowRight(r){if(!profile||!r)return false;if(profile.role==="admin"||profile.role==="manager")return isActiveRequest(r);return isActiveRequest(r)&&isAssignedToCurrentUser(r);}
function canCompleteRequest(r){if(!r||!profile)return false;if(profile.role==="admin")return true;return canSeeRequest(r);}
function canSeeJob(j){if(!profile||!j)return false;if(profile.role==="admin"||profile.role==="manager")return true;return requests.some(r=>r.job_id===j.id&&canSeeRequest(r));}
function currentReq(){return requests.find(r=>r.id===selectedId)||null;}
function currentJob(){return jobs.find(j=>j.id===selectedJobId)||null;}
function normalizeJob(j){return {id:j.id,sort_order:j.sort_order??9999,name:j.name||"Untitled Job",address:j.address||"",owner:j.owner||"",site_contact:j.site_contact||"",earthwork_start:j.earthwork_start||j.dirt_start||"",earthwork_end:j.earthwork_end||j.dirt_end||"",storm_drain_start:j.storm_drain_start||"",storm_drain_end:j.storm_drain_end||"",sewer_start:j.sewer_start||"",sewer_end:j.sewer_end||"",water_start:j.water_start||"",water_end:j.water_end||"",dropbox_link:j.dropbox_link||"",notes:j.notes||"",updated_at:j.updated_at};}

function phaseText(start,end){
  if(start||end) return `${esc(start||"—")} → ${esc(end||"—")}`;
  return "—";
}
function jobPhaseBadges(j){
  return `<div class="phaseGrid">
    <div class="phaseBadge phaseEarthwork"><span>EARTHWORK</span><small>${phaseText(j.earthwork_start,j.earthwork_end)}</small></div>
    <div class="phaseBadge phaseStorm"><span>STORM DRAIN</span><small>${phaseText(j.storm_drain_start,j.storm_drain_end)}</small></div>
    <div class="phaseBadge phaseSewer"><span>SEWER</span><small>${phaseText(j.sewer_start,j.sewer_end)}</small></div>
    <div class="phaseBadge phaseWater"><span>WATER</span><small>${phaseText(j.water_start,j.water_end)}</small></div>
  </div>`;
}

function normalizeReq(r){return {id:r.id,job_id:r.job_id||"",job:r.job||"",department:r.department||"",priority:r.priority||"Medium",status:r.status||"New",due_at:r.due_at||"",personnel:r.personnel||"",equipment_id:r.equipment_id||"",equipment_name:r.equipment_name||"",mechanic_severity:r.mechanic_severity||"",can_operate:r.can_operate||"",dropbox_link:r.dropbox_link||"",description:r.description||"",created_by_email:r.created_by_email||"",created_at:r.created_at,updated_at:r.updated_at};}

async function signIn(){try{let res=await fetch(authUrl("token?grant_type=password"),{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:authEmail.value.trim(),password:authPassword.value})});let data=await res.json();if(!res.ok)throw new Error(data.error_description||data.msg||JSON.stringify(data));session=data;localStorage.setItem("sb_session",JSON.stringify(session));startSessionAutoRefresh();await loadProfile();setViews();await loadAll();}catch(e){alert("Sign in failed: "+e.message);}}
async function signUp(){try{let res=await fetch(authUrl("signup"),{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:authEmail.value.trim(),password:authPassword.value})});let data=await res.json();if(!res.ok)throw new Error(data.error_description||data.msg||JSON.stringify(data));alert("Signup created. If confirmation is required, check email, then sign in.");}catch(e){alert("Signup failed: "+e.message);}}
function logout(){session=null;profile=null;if(window.__sessionRefreshTimer)clearInterval(window.__sessionRefreshTimer);localStorage.removeItem("sb_session");setViews();status("Signed out.");}
async function loadProfile(){let res=await apiFetch(rest("profiles","?select=*&id=eq."+session.user.id),{headers:headers()});let data=await res.json();profile=data[0]||{role:"standard",department:"",full_name:""};}
function setViews(){authView.classList.toggle("hidden",!!session);mainView.classList.toggle("hidden",!session);topButtons.classList.toggle("hidden",!session);if(session){signedInName.textContent=session.user.email;roleBadge.textContent=profile?.role||"unknown";assignWorkBtn.disabled=!canEdit();newJobBtn.disabled=!canEditJobs();}}

async function loadAll(){await Promise.all([loadPersonnel(),loadEquipment(),loadJobs(),loadRequests()]);renderAll();status("Loaded.");}
async function loadPersonnel(){let res=await apiFetch(rest("personnel","?select=*&active=eq.true&order=full_name.asc"),{headers:headers()});let data=await res.json();personnelList=Array.isArray(data)?data:[];}
async function loadEquipment(){let res=await apiFetch(rest("equipment","?select=*&status=neq.Inactive&order=name.asc"),{headers:headers()});let data=await res.json();equipmentList=Array.isArray(data)?data:[];}
async function loadJobs(){let res=await apiFetch(rest("JOBS","?select=*&order=sort_order.asc,updated_at.desc"),{headers:headers()});let data=await res.json();jobs=(data||[]).map(normalizeJob);if(!selectedJobId&&jobs[0])selectedJobId=jobs[0].id;}
async function loadRequests(){let res=await apiFetch(rest("REQUESTS","?select=*&order=updated_at.desc"),{headers:headers()});let data=await res.json();if(!res.ok)throw new Error(JSON.stringify(data));requests=(data||[]).map(normalizeReq);}
async function loadUpdates(id){let res=await apiFetch(rest("request_updates","?select=*&request_id=eq."+id+"&order=created_at.desc"),{headers:headers()});let data=await res.json();updates=Array.isArray(data)?data:[];}

function renderAll(){ensureVisibleSelectedJob();renderJobs();renderRequests();renderCalendar();renderDayList();renderFeed();if(!jobDrawer.classList.contains("hidden"))renderJobOverview();if(currentView==="operations")renderOperationsBoard();}
function ensureVisibleSelectedJob(){if(!selectedJobId||!jobs.find(j=>j.id===selectedJobId&&canSeeJob(j))){const first=jobs.find(canSeeJob);selectedJobId=first?first.id:null;}}

function renderJobs(){let q=jobSearch.value.toLowerCase();let arr=jobs.filter(j=>canSeeJob(j)&&JSON.stringify(j).toLowerCase().includes(q));jobList.innerHTML=arr.length?arr.map(j=>`<div class="item ${j.id===selectedJobId?"active":""}" data-job-id="${esc(j.id)}" draggable="true"><div class="title">${esc(j.name)}</div>${jobPhaseBadges(j)}<div class="meta">${requests.filter(r=>canSeeRequest(r)&&isActiveRequest(r)&&r.job_id===j.id).length} Active Work</div><div class="dragHint">Drag to reorder</div></div>`).join(""):`<div class="muted">No jobs yet.</div>`;document.querySelectorAll("[data-job-id]").forEach(el=>{el.onclick=()=>{if(window.__draggingJob)return;selectedJobId=el.dataset.jobId;renderAll();openJobDrawer(selectedJobId);};el.addEventListener("dragstart",e=>{window.__draggingJob=el.dataset.jobId;el.classList.add("dragging");e.dataTransfer.effectAllowed="move";});el.addEventListener("dragend",()=>{el.classList.remove("dragging");setTimeout(()=>window.__draggingJob=null,50);});el.addEventListener("dragover",e=>e.preventDefault());el.addEventListener("drop",async e=>{e.preventDefault();const from=window.__draggingJob,to=el.dataset.jobId;if(from&&to&&from!==to)await reorderJobsByDrop(from,to);});});}
async function reorderJobsByDrop(fromId,toId){if(!canEditJobs())return alert("No permission to rearrange jobs.");const visible=jobs.filter(canSeeJob);const from=visible.findIndex(j=>j.id===fromId),to=visible.findIndex(j=>j.id===toId);if(from<0||to<0)return;const[moved]=visible.splice(from,1);visible.splice(to,0,moved);for(let i=0;i<visible.length;i++)visible[i].sort_order=i+1;for(const j of visible){await apiFetch(rest("JOBS","?id=eq."+j.id),{method:"PATCH",headers:headers(),body:JSON.stringify({sort_order:j.sort_order,updated_at:new Date().toISOString()})});}await loadJobs();renderAll();}
function filteredRequests(){let q=search.value.toLowerCase(),dept=deptFilter.value,stat=statusFilter.value;return requests.filter(r=>canSeeRequest(r)&&JSON.stringify(r).toLowerCase().includes(q)&&(dept==="All"||r.department===dept)&&(((stat==="Active Work"||stat==="Active")&&shouldShowRight(r))||stat==="All Work"||stat==="All"||r.status===stat));}
function renderRequests(){let list=filteredRequests();requestList.innerHTML=list.length?list.map(r=>`<div class="request ${statusClass(r.status)} ${r.id===selectedId?"active":""}" data-id="${esc(r.id)}"><div class="requestTitle">${esc(workTitle(r))}</div><div class="meta">${esc(r.department)} • <span class="badge ${esc(r.priority)}">${esc(r.priority)}</span> • ${esc(r.status)}</div><div class="meta">Due: ${esc(fmt(r.due_at))}</div><div class="meta">${r.personnel?"Person: "+esc(r.personnel):"Department-wide"}${r.equipment_name?(r.department==="Mobilization"?" • Type: "+esc(r.equipment_name):" • Equip: "+esc(r.equipment_name)):""}</div>${r.department==="Maintenance"?`<div class="meta">Severity: ${esc(r.mechanic_severity||"Normal")} • Can operate: ${esc(r.can_operate||"Unknown")}</div>`:""}${r.dropbox_link?`<div class="meta">Dropbox link attached</div>`:""}</div>`).join(""):`<div class="muted">No active work.</div>`;document.querySelectorAll("#requestList .request").forEach(el=>el.onclick=()=>openWorkDrawer(el.dataset.id));}

const deptConfigs={
  Survey:{steps:["job","priorityDue","personnel","description"],desc:"Survey Request",placeholder:"What needs surveyed/staked? Include location, control info, plan set, and deadline."},
  Earthwork:{steps:["job","priorityDue","personnel","description"],desc:"Earthwork Work Details",placeholder:"What dirt work needs done? Include area, grade/sequence, and notes."},
  Utilities:{steps:["job","priorityDue","personnel","description"],desc:"Utilities Work Details",placeholder:"What utility work needs done? Include utility type, location, conflict, and timing."},
  Office:{steps:["job","priorityDue","personnel","description"],desc:"Office Task Details",placeholder:"What office/admin task needs completed?"},
  Trucks:{steps:["job","priorityDue","personnel","description"],desc:"Hauling / Delivery Details",placeholder:"What needs hauled or delivered? Include pickup, destination, material, quantity, and timing."},
  Maintenance:{steps:["equipment","mechanic","job","priorityDue","personnel","description"],desc:"Maintenance Note",placeholder:"Describe the problem clearly. Example: leaking hydraulic fluid near left track, machine still running but weak."},
  Mobilization:{steps:["equipmentType","job","priorityDue","personnel","description"],desc:"Move / Mobilization Details",placeholder:"What type of equipment is needed/moved? Include pickup location if known, destination, timing, and lowboy/trailer notes."}
};
function optionJobs(){return `<option value="">No specific job</option>${jobs.filter(canSeeJob).map(j=>`<option value="${esc(j.id)}">${esc(j.name)}</option>`).join("")}`;}
function optionPersonnel(dept){
  let filtered = personnelList.filter(function(p){
    return !dept || String(p.department || "").toLowerCase() === String(dept || "").toLowerCase();
  });
  filtered.sort(function(a,b){
    return String(a.full_name || "").localeCompare(String(b.full_name || ""), undefined, {sensitivity:"base"});
  });
  let html = '<option value="">Department-wide</option>';
  filtered.forEach(function(p){
    html += '<option value="' + esc(p.full_name) + '">' + esc(p.full_name) + (p.role ? " / " + esc(p.role) : "") + '</option>';
  });
  return html;
}

function equipmentTypeOptions(){
  const types = [
    "Water Truck",
    "Dump Truck",
    "Articulated Truck",
    "Lowboy Truck and Trailer",
    "Small Dozer",
    "Medium Dozer",
    "Large Dozer",
    "Mini Excavator",
    "Small Excavator",
    "Medium Excavator",
    "Large Excavator",
    "Skid Steer",
    "Roller",
    "Trench Roller",
    "Backhoe",
    "Loader",
    "Sweeper",
    "Survey Gear",
    "Support",
    "Other"
  ];
  return '<option></option>' + types.map(t=>`<option>${esc(t)}</option>`).join("");
}

function optionEquipment(){return `<option></option>${equipmentList.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}${e.equipment_number?" — "+esc(e.equipment_number):""}${e.current_job?" @ "+esc(e.current_job):""}</option>`).join("")}`;}
function renderWorkForm(existing=null){
  const dept=workDepartment.value;
  const cfg=deptConfigs[dept];
  dynamicSteps.innerHTML="";
  if(!cfg){dynamicSteps.innerHTML=`<div class="stepBox muted">Select who this work is assigned to.</div>`;return;}
  let n=2, html="";
  for(const step of cfg.steps){
    if(step==="equipment") html+=`<div class="stepBox"><div class="stepTitle">${n++}. Equipment</div><select id="f_equipment">${optionEquipment()}</select></div>`;
    if(step==="equipmentType") html+=`<div class="stepBox"><div class="stepTitle">${n++}. Equipment Type</div><select id="f_equipmentType">${equipmentTypeOptions()}</select><div class="muted" style="margin-top:6px">Use a general equipment category for mobilization. Maintenance requests still use the exact machine.</div></div>`;
    if(step==="mechanic") html+=`<div class="stepBox"><div class="stepTitle">${n++}. Maintenance Status</div><div class="two"><div><label>Severity</label><select id="f_mechSeverity"><option>Normal</option><option>Urgent</option><option>Down / Cannot Work</option></select></div><div><label>Can It Still Operate?</label><select id="f_canOperate"><option>Yes</option><option>No</option><option>Limited</option><option>Unknown</option></select></div></div></div>`;
    if(step==="job") html+=`<div class="stepBox"><div class="stepTitle">${n++}. Job / Project</div><select id="f_job">${optionJobs()}</select><div class="muted" style="margin-top:6px">Optional unless this work belongs to a specific job.</div></div>`;
    if(step==="priorityDue") html+=`<div class="stepBox"><div class="stepTitle">${n++}. Priority / Due Date</div><div class="two"><div><label>Priority</label><select id="f_priority"><option>Critical</option><option>High</option><option selected>Medium</option><option>Low</option></select></div><div><label>Status</label><select id="f_status"><option>New</option><option>Assigned</option><option>In Progress</option><option>Waiting</option><option>Complete</option><option>Closed</option></select></div></div><label>Due Date / Time</label><input id="f_due" type="datetime-local"></div>`;
    if(step==="personnel") html+=`<div class="stepBox"><div class="stepTitle">${n++}. Personnel</div><select id="f_personnel">${optionPersonnel(dept)}</select><div class="muted" style="margin-top:6px">Leave blank to assign to the whole department.</div></div>`;
    if(step==="description") html+=`<div class="stepBox"><div class="stepTitle">${n++}. Details</div><label>${esc(cfg.desc)}</label><textarea id="f_description" placeholder="${esc(cfg.placeholder)}"></textarea><label>Request Dropbox Link</label><input id="f_dropbox" placeholder="Optional file/folder link for this request"></div>`;
  }
  dynamicSteps.innerHTML=html;
  if(existing){
    if(document.getElementById("f_job"))f_job.value=existing.job_id||"";
    if(document.getElementById("f_priority"))f_priority.value=existing.priority||"Medium";
    if(document.getElementById("f_status"))f_status.value=existing.status||"New";
    if(document.getElementById("f_due"))f_due.value=toLocalDateTime(existing.due_at||"");
    if(document.getElementById("f_personnel"))f_personnel.value=existing.personnel||"";
    if(document.getElementById("f_equipment"))f_equipment.value=existing.equipment_id||"";
    if(document.getElementById("f_equipmentType"))f_equipmentType.value=existing.equipment_name||"";
    if(document.getElementById("f_mechSeverity"))f_mechSeverity.value=existing.mechanic_severity||"Normal";
    if(document.getElementById("f_canOperate"))f_canOperate.value=existing.can_operate||"Unknown";
    if(document.getElementById("f_description"))f_description.value=existing.description||"";
    if(document.getElementById("f_dropbox"))f_dropbox.value=existing.dropbox_link||"";
  }
}
function getWorkForm(){const dept=workDepartment.value;const eq=document.getElementById("f_equipment")?equipmentList.find(e=>e.id===f_equipment.value):null;const eqType=document.getElementById("f_equipmentType")?f_equipmentType.value:"";const job=document.getElementById("f_job")?jobs.find(j=>j.id===f_job.value):null;return{department:dept,job_id:job?.id||null,job:job?.name||"",priority:document.getElementById("f_priority")?f_priority.value:"Medium",status:document.getElementById("f_status")?f_status.value:"New",due_at:document.getElementById("f_due")&&f_due.value?new Date(f_due.value).toISOString():null,personnel:document.getElementById("f_personnel")?f_personnel.value:"",equipment_id:eq?.id||null,equipment_name:eq?.name||eqType||"",mechanic_severity:document.getElementById("f_mechSeverity")?f_mechSeverity.value:null,can_operate:document.getElementById("f_canOperate")?f_canOperate.value:null,dropbox_link:document.getElementById("f_dropbox")?f_dropbox.value:"",description:document.getElementById("f_description")?f_description.value:""};}
function clearWorkForm(){selectedId=null;workDepartment.value="";renderWorkForm(null);setWorkMode("new");}
function setWorkMode(mode){sendWorkBtn.classList.toggle("hidden",mode!=="new");clearWorkBtn.classList.toggle("hidden",mode!=="new");saveWorkBtn.classList.toggle("hidden",mode==="new");completeWorkBtn.classList.toggle("hidden",mode==="new");addUpdateBtn.classList.toggle("hidden",mode==="new");deleteWorkBtn.classList.toggle("hidden",mode==="new");openWorkDropboxBtn.classList.toggle("hidden",mode==="new");}
async function openWorkDrawer(id=null){selectedId=id;if(id){await loadUpdates(id);let r=currentReq();workDrawerTitle.textContent="Request Details";workDepartment.value=r.department||"";renderWorkForm(r);setWorkMode("details");}else{updates=[];workDrawerTitle.textContent="Assign Work";clearWorkForm();feed.innerHTML='<div class="meta">Fill out the form and click Send Request.</div>';}workDrawer.classList.remove("hidden");renderFeed();}
function closeWorkDrawer(){workDrawer.classList.add("hidden");}
async function addUpdate(text,type="update"){let r=currentReq();if(!r)return;let payload={request_id:r.id,update_text:text,action_type:type,created_by:session.user.id,created_by_email:actorEmail()};let res=await apiFetch(rest("request_updates"),{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});if(!res.ok)alert(await res.text());await loadUpdates(r.id);renderFeed();}
async function sendWork(){if(!canEdit())return alert("No permission.");let data=getWorkForm();if(!data.department)return alert("Select who this is assigned to.");if(data.department==="Maintenance"&&!data.equipment_id)return alert("Select equipment for the maintenance request.");if(data.department==="Mobilization"&&!data.equipment_name)return alert("Select an equipment type for the mobilization request.");if(!data.description)return alert("Add request details.");let payload={...data,created_by:session.user.id,created_by_email:actorEmail(),updated_by:session.user.id,updated_at:new Date().toISOString()};let res=await apiFetch(rest("REQUESTS"),{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});let out=await res.json();if(!res.ok)return alert(JSON.stringify(out));let created=normalizeReq(out[0]);requests.unshift(created);selectedId=created.id;let msg=created.department==="Maintenance"?`Maintenance request created. Equipment: ${created.equipment_name||"Not listed"}. Severity: ${created.mechanic_severity||"Normal"}. Can operate: ${created.can_operate||"Unknown"}. Note: ${created.description||""}`:created.department==="Mobilization"?`Mobilization request created. Equipment type: ${created.equipment_name||"Not listed"}. Job: ${created.job||"No specific job"}. Note: ${created.description||""}`:`Work request created. Assigned to ${created.department}${created.personnel?" / "+created.personnel:" department-wide"}.`;await addUpdate(msg,"created");await loadRequests();status("Work request sent and saved.");closeWorkDrawer();clearWorkForm();renderAll();}
async function saveWork(){let r=currentReq();if(!r)return sendWork();let data=getWorkForm();let res=await apiFetch(rest("REQUESTS","?id=eq."+r.id),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({...data,updated_by:session.user.id,updated_at:new Date().toISOString()})});let out=await res.json();if(!res.ok)return alert(JSON.stringify(out));Object.assign(r,normalizeReq(out[0]));await addUpdate("Request saved.","change");await loadRequests();renderAll();status("Saved.");}
async function completeWork(){let r=currentReq();if(!r)return alert("Select a request.");if(!canCompleteRequest(r))return alert("No permission.");if(!confirm("Mark this assigned work complete?"))return;let res=await apiFetch(rest("REQUESTS","?id=eq."+r.id),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({status:"Complete",updated_by:session.user.id,updated_at:new Date().toISOString()})});let out=await res.json();if(!res.ok)return alert(JSON.stringify(out));Object.assign(r,normalizeReq(out[0]));await addUpdate("Marked work complete and moved to history.","complete");await loadRequests();await openWorkDrawer(r.id);status("Work completed.");}
async function addManualUpdate(){let r=currentReq();if(!r)return alert("Select a request.");let text=prompt("Update:");if(!text)return;await addUpdate(text,"update");}
async function deleteWork(){let r=currentReq();if(!r||!canDelete())return;if(!confirm("Delete request?"))return;let res=await apiFetch(rest("REQUESTS","?id=eq."+r.id),{method:"DELETE",headers:headers()});if(!res.ok)return alert(await res.text());requests=requests.filter(x=>x.id!==r.id);selectedId=null;closeWorkDrawer();renderAll();}

function renderFeed(){if(workDrawer.classList.contains("hidden"))return;feed.innerHTML=updates.length?updates.map(u=>`<div class="feedItem"><div class="meta"><b>${esc(u.created_by_email||"Unknown")}</b> • ${esc(fmt(u.created_at))}</div><div>${esc(u.update_text)}</div></div>`).join(""):`<div class="meta">No updates yet.</div>`;}

function openJobDrawer(id=null){selectedJobId=id||null;refreshJobDrawer();jobDrawer.classList.remove("hidden");}
function refreshJobDrawer(){let j=currentJob();jobDrawerTitle.textContent=j?"Job Overview":"New Job";jobNameInput.value=j?.name||"";jobAddressInput.value=j?.address||"";jobOwnerInput.value=j?.owner||"";jobSiteContactInput.value=j?.site_contact||"";earthworkStartInput.value=dateOnly(j?.earthwork_start||j?.earthwork_start||j?.dirt_start||"");
earthworkEndInput.value=dateOnly(j?.earthwork_end||j?.earthwork_end||j?.dirt_end||"");
stormDrainStartInput.value=dateOnly(j?.storm_drain_start||"");
stormDrainEndInput.value=dateOnly(j?.storm_drain_end||"");
sewerStartInput.value=dateOnly(j?.sewer_start||"");
sewerEndInput.value=dateOnly(j?.sewer_end||"");
waterStartInput.value=dateOnly(j?.water_start||"");
waterEndInput.value=dateOnly(j?.water_end||"");jobDropboxInput.value=j?.dropbox_link||"";jobNotesInput.value=j?.notes||"";deleteJobBtn.disabled=!canDelete()||!j;saveJobBtn.disabled=!canEditJobs();renderJobOverview();}
function renderJobOverview(){let j=currentJob();if(!j){jobOverviewStats.innerHTML="Create or select a job.";jobRequestsList.innerHTML="No active work yet.";jobLatestActivity.innerHTML="No history yet.";return;}let allReqs=requests.filter(r=>canSeeRequest(r)&&r.job_id===j.id);let reqs=allReqs.filter(isActiveRequest);let critical=reqs.filter(r=>r.priority==="Critical").length;let overdue=reqs.filter(r=>r.due_at&&new Date(r.due_at)<new Date()).length;jobOverviewStats.innerHTML=`<div class="three"><div><span class="badge">Total Work: ${allReqs.length}</span></div><div><span class="badge">Active: ${reqs.length}</span></div><div><span class="badge Critical">Critical: ${critical}</span></div></div><div class="meta" style="margin-top:8px;">Address: ${esc(j.address||"—")}<br>Owner: ${esc(j.owner||"—")} • Site Contact: ${esc(j.site_contact||"—")}<br>Earthwork: ${esc(j.dirt_start||"—")} → ${esc(j.dirt_end||"—")} • Utilities: ${esc(j.utilities_start||"—")} → ${esc(j.utilities_end||"—")} • Overdue Work: ${overdue}</div>`;jobRequestsList.innerHTML=reqs.length?reqs.map(r=>`<div class="request ${statusClass(r.status)}" data-job-req="${esc(r.id)}"><div class="requestTitle">${esc(workTitle(r))}</div><div class="meta"><span class="badge ${esc(r.priority)}">${esc(r.priority)}</span> • ${esc(r.department)} • ${esc(r.status)} • Due: ${esc(fmt(r.due_at))}</div><div class="meta">${r.personnel?esc(r.personnel):"Department-wide"}${r.equipment_name?(r.department==="Mobilization"?" • Type: "+esc(r.equipment_name):" • "+esc(r.equipment_name)):""}</div><div class="meta">${esc(r.description||"No description").slice(0,220)}</div>${r.dropbox_link?`<div class="meta">Dropbox link attached</div>`:""}</div>`).join(""):`<div class="muted">No active work. Click “Assign Work to This Job” to create one.</div>`;jobRequestsList.querySelectorAll("[data-job-req]").forEach(el=>el.onclick=()=>openWorkDrawer(el.dataset.jobReq));let latest=allReqs.slice().sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0)).slice(0,5);jobLatestActivity.innerHTML=latest.length?latest.map(r=>`<div class="feedItem"><div class="meta"><b>${esc(r.department)}</b> • ${esc(r.status)} • ${esc(fmt(r.updated_at))}</div><div>${esc(workTitle(r))}</div></div>`).join(""):`<div class="muted">No history yet.</div>`;}
function switchJob(step){let visible=jobs.filter(canSeeJob);if(!visible.length)return;let idx=visible.findIndex(j=>j.id===selectedJobId);if(idx<0)idx=0;idx=(idx+step+visible.length)%visible.length;selectedJobId=visible[idx].id;renderAll();refreshJobDrawer();}
async function saveJob(){if(!canEditJobs())return alert("No permission to edit jobs.");let j=currentJob();let payload={name:jobNameInput.value||"Untitled Job",address:jobAddressInput.value,owner:jobOwnerInput.value,site_contact:jobSiteContactInput.value,earthwork_start:earthworkStartInput.value||null,
earthwork_end:earthworkEndInput.value||null,
storm_drain_start:stormDrainStartInput.value||null,
storm_drain_end:stormDrainEndInput.value||null,
sewer_start:sewerStartInput.value||null,
sewer_end:sewerEndInput.value||null,
water_start:waterStartInput.value||null,
water_end:waterEndInput.value||null,dropbox_link:jobDropboxInput.value,notes:jobNotesInput.value,sort_order:(j?.sort_order??jobs.length),updated_by:session.user.id,updated_at:new Date().toISOString()};let res;if(j)res=await apiFetch(rest("JOBS","?id=eq."+j.id),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});else res=await apiFetch(rest("JOBS"),{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({...payload,created_by:session.user.id})});let out=await res.json();if(!res.ok)return alert(JSON.stringify(out));await loadJobs();selectedJobId=out[0].id;jobDrawer.classList.add("hidden");renderAll();}
async function deleteJob(){let j=currentJob();if(!j||!canDelete())return;if(!confirm("Delete job?"))return;let res=await apiFetch(rest("JOBS","?id=eq."+j.id),{method:"DELETE",headers:headers()});if(!res.ok)return alert(await res.text());jobs=jobs.filter(x=>x.id!==j.id);selectedJobId=jobs[0]?.id||null;jobDrawer.classList.add("hidden");renderAll();}

function renderCalendar(){let y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0);calendarTitle.textContent=first.toLocaleDateString(undefined,{month:"long",year:"numeric"});let by={};requests.filter(r=>canSeeRequest(r)&&isActiveRequest(r)).forEach(r=>{if(r.due_at){let key=dateKey(new Date(r.due_at));by[key]=by[key]||[];by[key].push(r);}});let names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];let out=`<div class="calendarGrid">${names.map(n=>`<div class="dayName">${n}</div>`).join("")}`;for(let i=0;i<first.getDay();i++)out+=`<div class="day empty"></div>`;let today=dateKey(new Date());for(let d=1;d<=last.getDate();d++){let key=dateKey(new Date(y,m,d)),events=by[key]||[];out+=`<div class="day ${key===today?"today":""} ${key===selectedDay?"selected":""}" data-day="${key}"><div class="dateNum">${d}</div>${events.slice(0,4).map(e=>`<div class="event ${esc(e.priority)}">${esc(workTitle(e))}</div>`).join("")}</div>`;}out+=`</div>`;calendar.innerHTML=out;document.querySelectorAll("[data-day]").forEach(el=>el.onclick=()=>{selectedDay=el.dataset.day;renderAll();});}
function renderDayList(){if(!selectedDay){selectedDayTitle.textContent="Selected Day";dayList.innerHTML="Click a date to see active work due that day.";return;}selectedDayTitle.textContent="Due "+new Date(selectedDay+"T00:00:00").toLocaleDateString();let matches=requests.filter(r=>canSeeRequest(r)&&isActiveRequest(r)&&r.due_at&&dateKey(new Date(r.due_at))===selectedDay);dayList.innerHTML=matches.length?matches.map(r=>`<div class="request ${statusClass(r.status)}" data-id="${esc(r.id)}"><div class="requestTitle">${esc(workTitle(r))}</div><div class="meta">${esc(r.department)} • <span class="badge ${esc(r.priority)}">${esc(r.priority)}</span> • ${esc(r.status)}</div></div>`).join(""):"Nothing due this day.";dayList.querySelectorAll(".request").forEach(el=>el.onclick=()=>openWorkDrawer(el.dataset.id));}

function equipmentTypeColor(type){type=String(type||"").toLowerCase();if(type.includes("dozer"))return"#facc15";if(type.includes("excavator")||type.includes("trackhoe"))return"#fb923c";if(type.includes("truck")||type.includes("lowboy"))return"#60a5fa";if(type.includes("roller"))return"#4ade80";if(type.includes("skid"))return"#c084fc";if(type.includes("backhoe")||type.includes("loader"))return"#a3e635";if(type.includes("sweeper"))return"#94a3b8";return"#d1d5db";}
function equipmentStatusBorder(status){status=String(status||"").toLowerCase();if(status.includes("down"))return"4px solid #dc2626";if(status.includes("shop"))return"4px solid #f97316";return"2px solid #d1d5db";}
function switchMainView(view){currentView=view;calendarView.classList.toggle("hidden",view!=="calendar");operationsView.classList.toggle("hidden",view!=="operations");calendarViewBtn.classList.toggle("secondary",view!=="calendar");operationsViewBtn.classList.toggle("secondary",view!=="operations");if(view==="operations")renderOperationsBoard();}

function boardJobOptions(currentJob){
  const options = ["UNASSIGNED", "SHOP", ...jobs.map(j=>j.name)];
  return options.map(name=>{
    const value = name === "UNASSIGNED" ? "" : name;
    const selected = (currentJob || "") === value ? "selected" : "";
    return `<option value="${esc(value)}" ${selected}>${esc(name)}</option>`;
  }).join("");
}

async function quickMoveEquipment(equipmentId, targetJob){
  const payload = { current_job: targetJob || null };
  let res = await apiFetch(rest("equipment","?id=eq."+equipmentId),{
    method:"PATCH",
    headers:headers({"Prefer":"return=representation"}),
    body:JSON.stringify(payload)
  });

  if(!res.ok){
    alert("Could not move equipment.");
    return;
  }

  await loadEquipment();
  renderOperationsBoard();
  status("Equipment moved.");
}


function equipmentTypeClass(type){
  const text = String(type || "").toLowerCase();
  if(text.includes("dozer")) return "type-dozer";
  if(text.includes("excavator") || text.includes("trackhoe") || text.includes("mini")) return "type-excavator";
  if(text.includes("truck") || text.includes("lowboy")) return "type-truck";
  if(text.includes("roller") || text.includes("compactor")) return "type-roller";
  if(text.includes("skid")) return "type-skid";
  if(text.includes("backhoe") || text.includes("loader")) return "type-loader";
  if(text.includes("sweeper")) return "type-sweeper";
  if(text.includes("survey")) return "type-survey";
  return "type-other";
}

function equipmentTypeLabel(type){
  const text = String(type || "").toLowerCase();
  if(text.includes("dozer")) return "Dozer";
  if(text.includes("excavator") || text.includes("trackhoe") || text.includes("mini")) return "Excavator";
  if(text.includes("water truck")) return "Water Truck";
  if(text.includes("dump truck") || text.includes("articulated")) return "Dump Truck";
  if(text.includes("lowboy")) return "Lowboy";
  if(text.includes("roller") || text.includes("compactor")) return "Roller";
  if(text.includes("skid")) return "Skid Steer";
  if(text.includes("backhoe")) return "Backhoe";
  if(text.includes("loader")) return "Loader";
  if(text.includes("sweeper")) return "Sweeper";
  if(text.includes("survey")) return "Survey";
  return "Equipment";
}

function equipmentTypeIcon(type){
  const text = String(type || "").toLowerCase();
  if(text.includes("dozer")) return "🚜";
  if(text.includes("excavator") || text.includes("trackhoe")) return "⛏️";
  if(text.includes("truck") || text.includes("lowboy")) return "🚛";
  if(text.includes("roller")) return "⚙️";
  if(text.includes("skid")) return "🚧";
  if(text.includes("backhoe") || text.includes("loader")) return "🏗️";
  if(text.includes("sweeper")) return "🧹";
  if(text.includes("survey")) return "📡";
  return "🔧";
}


function shortEquipmentName(name){
  let s = String(name || "");
  // Remove leading year to save card space, keep equipment/model/#.
  s = s.replace(/^\d{4}\s+/, "");
  return s.length > 42 ? s.slice(0, 42) + "…" : s;
}


function equipmentModelKey(name, type){
  const text = String((name || "") + " " + (type || "")).toLowerCase();

  const rules = [
    [/cat\s+cs56b/, "cat-cs56b-roller"],
    [/cat\s+cs11/, "cat-cs11-roller"],
    [/cat\s+730/, "cat-730-articulated-truck"],
    [/cat\s+745/, "cat-745-articulated-truck"],
    [/cat\s+304/, "cat-304-mini-excavator"],
    [/cat\s+308/, "cat-308-mini-excavator"],
    [/cat\s+302\.7/, "cat-302-7-mini-excavator"],
    [/cat\s+303\.5/, "cat-303-5-mini-excavator"],
    [/cat\s+315/, "cat-315-excavator"],
    [/cat\s+316f/, "cat-316f-excavator"],
    [/cat\s+320/, "cat-320-excavator"],
    [/cat\s+336e/, "cat-336e-excavator"],
    [/cat\s+336f/, "cat-336f-excavator"],
    [/cat\s+415/, "cat-415-backhoe"],
    [/cat\s+920/, "cat-920-loader"],
    [/cat\s+d3/, "cat-d3-dozer"],
    [/cat\s+d5/, "cat-d5-dozer"],
    [/cat\s+d6/, "cat-d6-dozer"],
    [/cat\s+d8/, "cat-d8-dozer"],
    [/cat\s+275/, "cat-275-skid-steer"],
    [/cat\s+299/, "cat-299-skid-steer"],
    [/jd\s+160/, "john-deere-160-excavator"],
    [/jd\s+550k/, "john-deere-550k-dozer"],
    [/jd\s+650k/, "john-deere-650k-dozer"],
    [/komatsu\s+210/, "komatsu-210-excavator"],
    [/kubota\s+m62/, "kubota-m62-backhoe"],
    [/bomag\s+bmp8500/, "bomag-bmp8500-trench-roller"],
    [/wacker\s+rtkk/, "wacker-rtkk-sc3-trench-roller"],
    [/hamm\s+3307/, "hamm-3307p-roller"],
    [/hamm\s+h10i/, "hamm-h10i-roller"],
    [/hamm\s+htc15/, "hamm-htc15-trench-roller"],
    [/hamm\s+84/, "hamm-84-padfoot-roller"],
    [/dynapac.*ca\s*250/, "dynapac-ca250-roller"],
    [/dynapac.*ca\s*350/, "dynapac-ca350-roller"],
    [/ford water truck/, "ford-water-truck"],
    [/dump truck quad/, "quad-dump-truck"],
    [/dump truck triaxle/, "triaxle-dump-truck"],
    [/lowboy/, "lowboy-truck-trailer"],
    [/laymore|laymor/, "laymor-sweep-master"]
  ];

  for(const [regex,key] of rules){
    if(regex.test(text)) return key;
  }

  if(text.includes("dozer")) return "cat-d5-dozer";
  if(text.includes("excavator") || text.includes("trackhoe")) return "cat-320-excavator";
  if(text.includes("skid")) return "cat-299-skid-steer";
  if(text.includes("roller")) return "cat-cs56b-roller";
  if(text.includes("water truck")) return "ford-water-truck";
  if(text.includes("dump truck")) return "triaxle-dump-truck";
  if(text.includes("backhoe")) return "cat-415-backhoe";
  if(text.includes("loader")) return "cat-920-loader";

  return "generic-equipment";
}

const EQUIPMENT_MODEL_IMAGES = {
  "ford-water-truck": "equipment-images/ford-water-truck.jpg",
  "cat-cs56b-roller": "equipment-images/cat-cs56b-roller.jpg",
  "cat-730-articulated-truck": "equipment-images/cat-730-articulated-truck.jpg",
  "cat-745-articulated-truck": "equipment-images/cat-745-articulated-truck.jpg",
  "mini-excavator": "equipment-images/mini-excavator.jpg",
  "cat-304-mini-excavator": "equipment-images/cat-304-mini-excavator.jpg",
  "cat-cs11-roller": "equipment-images/cat-cs11-roller.jpg",
  "cat-d3-dozer": "equipment-images/cat-d3-dozer.jpg",
  "skid-steer": "equipment-images/skid-steer.jpg",
  "cat-320-excavator": "equipment-images/cat-320-excavator.jpg",
  "cat-d5-dozer": "equipment-images/cat-d5-dozer.jpg",
  "bomag-bmp8500-trench-roller": "equipment-images/bomag-bmp8500-trench-roller.jpg",
  "cat-275-skid-steer": "equipment-images/cat-275-skid-steer.jpg",
  "cat-299-skid-steer": "equipment-images/cat-299-skid-steer.jpg",
  "cat-302-7-mini-excavator": "equipment-images/cat-302-7-mini-excavator.jpg",
  "cat-303-5-mini-excavator": "equipment-images/cat-303-5-mini-excavator.jpg",
  "cat-308-mini-excavator": "equipment-images/cat-308-mini-excavator.jpg",
  "cat-315-excavator": "equipment-images/cat-315-excavator.jpg",
  "cat-316f-excavator": "equipment-images/cat-316f-excavator.jpg",
  "cat-336e-excavator": "equipment-images/cat-336e-excavator.jpg",
  "cat-336f-excavator": "equipment-images/cat-336f-excavator.jpg",
  "cat-415-backhoe": "equipment-images/cat-415-backhoe.jpg",
  "cat-920-loader": "equipment-images/cat-920-loader.jpg",
  "cat-d6-dozer": "equipment-images/cat-d6-dozer.jpg",
  "cat-d8-dozer": "equipment-images/cat-d8-dozer.jpg",
  "quad-dump-truck": "equipment-images/quad-dump-truck.jpg",
  "triaxle-dump-truck": "equipment-images/triaxle-dump-truck.jpg",
  "dynapac-ca250-roller": "equipment-images/dynapac-ca250-roller.jpg",
  "dynapac-ca350-roller": "equipment-images/dynapac-ca350-roller.jpg",
  "hamm-3307p-roller": "equipment-images/hamm-3307p-roller.jpg",
  "hamm-84-padfoot-roller": "equipment-images/hamm-84-padfoot-roller.jpg",
  "hamm-h10i-roller": "equipment-images/hamm-h10i-roller.jpg",
  "hamm-htc15-trench-roller": "equipment-images/hamm-htc15-trench-roller.jpg",
  "john-deere-160-excavator": "equipment-images/john-deere-160-excavator.jpg",
  "john-deere-550k-dozer": "equipment-images/john-deere-550k-dozer.jpg",
  "john-deere-650k-dozer": "equipment-images/john-deere-650k-dozer.jpg",
  "komatsu-210-excavator": "equipment-images/komatsu-210-excavator.jpg",
  "kubota-m62-backhoe": "equipment-images/kubota-m62-backhoe.jpg",
  "laymor-sweep-master": "equipment-images/laymor-sweep-master.jpg",
  "lowboy-truck-trailer": "equipment-images/lowboy-truck-trailer.jpg",
  "wacker-rtkk-sc3-trench-roller": "equipment-images/wacker-rtkk-sc3-trench-roller.jpg"
};

function equipmentModelImage(name, type){
  const key = equipmentModelKey(name, type);
  return EQUIPMENT_MODEL_IMAGES[key] || "equipment-images/generic-equipment.jpg";
}

function renderOperationsBoard(){
  let grouped={};
  jobs.forEach(j=>grouped[j.name]=[]);
  grouped["SHOP"]=grouped["SHOP"]||[];
  grouped["UNASSIGNED"]=grouped["UNASSIGNED"]||[];

  equipmentList.forEach(eq=>{
    let key=eq.current_job||"UNASSIGNED";
    if(!grouped[key]) grouped[key]=[];
    grouped[key].push(eq);
  });

  const unassignedCount = grouped["UNASSIGNED"] ? grouped["UNASSIGNED"].length : 0;

  operationsBoard.innerHTML=`
    <div class="boardTools">
      <input id="boardSearch" placeholder="Search equipment name, number, type, status..." />
      <div class="muted">Full-width job rows. Scroll sideways inside each job row if it has a lot of equipment. Unassigned: ${unassignedCount}</div>
    </div>

    <div class="boardJobRows">
      ${Object.entries(grouped).map(([job,eqs])=>`
        <section class="jobRow" data-board-job="${esc(job)}">
          <div class="jobRowHeader">
            <div>
              <h3>${esc(job)}</h3>
              <div class="muted">${eqs.length} equipment assigned</div>
            </div>
            <span class="badge">${eqs.length}</span>
          </div>

          <div class="jobEquipmentStrip">
            ${eqs.length?eqs.map(eq=>`
              <div draggable="true" data-equipment-id="${esc(eq.id)}" class="equipmentCard boardMiniCard" style="background:${equipmentTypeColor(eq.equipment_type)};border:${equipmentStatusBorder(eq.status)}">
                ${typeof equipmentModelImage==="function" ? `
                  <div class="equipPhotoWrap">
                    <img class="equipPhoto" src="${equipmentModelImage(eq.name, eq.equipment_type)}" alt="${esc(eq.name)}" loading="lazy" onerror="this.closest('.equipPhotoWrap').classList.add('photoMissing'); this.style.display='none';">
                    <div class="equipMissingIcon">${equipmentTypeIcon(eq.equipment_type)}</div>
                  </div>
                ` : `
                  <div class="equipVisual ${typeof equipmentTypeClass==="function" ? equipmentTypeClass(eq.equipment_type) : ""}">
                    <div class="equipBigIcon">${equipmentTypeIcon(eq.equipment_type)}</div>
                  </div>
                `}
                <div class="miniCardText">
                  <b>${esc(typeof shortEquipmentName==="function" ? shortEquipmentName(eq.name) : eq.name)}</b>
                  <div class="meta">${esc(eq.equipment_type||"Equipment")}${eq.equipment_number?" • "+esc(eq.equipment_number):""}</div>
                  <div class="meta">Status: ${esc(eq.status||"Active")}</div>
                  ${eq.assigned_foreman?`<div class="meta">Foreman: ${esc(eq.assigned_foreman)}</div>`:""}
                </div>
                <div class="quickMove">
                  <select data-move-select="${esc(eq.id)}">${boardJobOptions(eq.current_job||"")}</select>
                  <button class="secondary" data-move-equipment="${esc(eq.id)}" type="button">Move</button>
                </div>
              </div>
            `).join(""):`<div class="muted emptyRowNote">No equipment assigned.</div>`}
          </div>
        </section>
      `).join("")}
    </div>`;

  document.querySelectorAll("[data-equipment-id]").forEach(card=>{
    card.addEventListener("dragstart",()=>window.__dragEquipmentId=card.dataset.equipmentId);
    card.addEventListener("dragend",()=>window.__dragEquipmentId=null);
  });

  document.querySelectorAll("[data-board-job]").forEach(row=>{
    row.addEventListener("dragover",e=>e.preventDefault());
    row.addEventListener("drop",async e=>{
      e.preventDefault();
      let id=window.__dragEquipmentId;
      if(!id)return;
      let target=row.dataset.boardJob;
      await quickMoveEquipment(id, target==="UNASSIGNED" ? "" : target);
    });
  });

  document.querySelectorAll("[data-move-equipment]").forEach(btn=>{
    btn.onclick=async()=>{
      const id = btn.dataset.moveEquipment;
      const sel = document.querySelector(`[data-move-select="${CSS.escape(id)}"]`);
      await quickMoveEquipment(id, sel ? sel.value : "");
    };
  });

  const searchBox = document.getElementById("boardSearch");
  if(searchBox){
    searchBox.oninput=()=>{
      const q = searchBox.value.toLowerCase();
      document.querySelectorAll(".boardMiniCard").forEach(card=>{
        card.classList.toggle("hidden", !card.textContent.toLowerCase().includes(q));
      });
    };
  }
}

function clearPersonnelForm(){personnelId.value="";personnelName.value="";personnelDepartment.value="";personnelRole.value="";personnelEmail.value="";personnelPhone.value="";personnelNotes.value="";}
function renderPersonnelManageList(){
  personnelManageList.innerHTML=personnelList.length?personnelList.map(p=>`
    <div class="feedItem personnelRow" data-personnel-row="${esc(p.id)}">
      <b>${esc(p.full_name)}</b>
      <div class="meta">${esc(p.department||"No department")} • ${esc(p.role||"No role")}</div>
      <div class="meta">${esc(p.email||"")}${p.phone?" • "+esc(p.phone):""}</div>
      <div class="toolbar" style="margin-top:8px">
        <button class="secondary" data-edit-personnel="${esc(p.id)}">Edit</button>
        <button class="danger" data-disable-personnel="${esc(p.id)}">Deactivate</button>
      </div>
      <div class="inlinePersonnelEdit hidden" data-inline-personnel="${esc(p.id)}"></div>
    </div>
  `).join(""):"No personnel added yet.";

  document.querySelectorAll("[data-edit-personnel]").forEach(btn=>btn.onclick=()=>{
    let p=personnelList.find(x=>x.id===btn.dataset.editPersonnel);
    if(!p)return;

    document.querySelectorAll(".inlinePersonnelEdit").forEach(el=>{
      if(el.dataset.inlinePersonnel!==p.id) el.classList.add("hidden");
    });

    let box=document.querySelector(`[data-inline-personnel="${CSS.escape(p.id)}"]`);
    if(!box)return;

    const isOpen=!box.classList.contains("hidden");
    if(isOpen){
      box.classList.add("hidden");
      return;
    }

    box.innerHTML=`
      <div class="inlineEditBox">
        <h3>Edit ${esc(p.full_name||"Person")}</h3>
        <label>Full Name</label>
        <input data-inline-field="full_name" value="${esc(p.full_name||"")}">

        <div class="two">
          <div>
            <label>Department</label>
            <select data-inline-field="department">
              <option></option>
              ${["Earthwork","Maintenance","Mobilization","Office","Survey","Trucks","Utilities"].map(d=>`<option ${p.department===d?"selected":""}>${d}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Role / Position</label>
            <input data-inline-field="role" value="${esc(p.role||"")}">
          </div>
        </div>

        <div class="two">
          <div>
            <label>Email</label>
            <input data-inline-field="email" value="${esc(p.email||"")}">
          </div>
          <div>
            <label>Phone</label>
            <input data-inline-field="phone" value="${esc(p.phone||"")}">
          </div>
        </div>

        <label>Notes</label>
        <textarea data-inline-field="notes">${esc(p.notes||"")}</textarea>

        <div class="toolbar" style="margin-top:10px">
          <button data-save-inline-personnel="${esc(p.id)}">Save</button>
          <button class="secondary" data-cancel-inline-personnel="${esc(p.id)}">Cancel</button>
        </div>
      </div>
    `;
    box.classList.remove("hidden");

    box.querySelector("[data-cancel-inline-personnel]").onclick=()=>box.classList.add("hidden");

    box.querySelector("[data-save-inline-personnel]").onclick=async()=>{
      let payload={active:true};
      box.querySelectorAll("[data-inline-field]").forEach(field=>{
        payload[field.dataset.inlineField]=field.value.trim();
      });
      if(!payload.full_name)return alert("Enter a full name.");

      let res=await apiFetch(rest("personnel","?id=eq."+p.id),{
        method:"PATCH",
        headers:headers({"Prefer":"return=representation"}),
        body:JSON.stringify(payload)
      });
      let out=await res.json().catch(()=>[]);
      if(!res.ok)return alert(JSON.stringify(out));

      await loadPersonnel();
      renderPersonnelManageList();
      status("Personnel saved.");
    };
  });

  document.querySelectorAll("[data-disable-personnel]").forEach(btn=>btn.onclick=async()=>{
    if(!confirm("Deactivate this person?"))return;
    let res=await apiFetch(rest("personnel","?id=eq."+btn.dataset.disablePersonnel),{
      method:"PATCH",
      headers:headers({"Prefer":"return=representation"}),
      body:JSON.stringify({active:false})
    });
    if(!res.ok)return alert(await res.text());
    await loadPersonnel();
    renderPersonnelManageList();
  });
}

async function openPersonnelDrawer(){personnelDrawer.classList.remove("hidden");await loadPersonnel();renderPersonnelManageList();}
async function savePersonnel(){let payload={full_name:personnelName.value.trim(),department:personnelDepartment.value,role:personnelRole.value.trim(),email:personnelEmail.value.trim(),phone:personnelPhone.value.trim(),notes:personnelNotes.value.trim(),active:true};if(!payload.full_name)return alert("Enter a full name.");let res;if(personnelId.value)res=await apiFetch(rest("personnel","?id=eq."+personnelId.value),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});else res=await apiFetch(rest("personnel"),{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});let out=await res.json().catch(()=>[]);if(!res.ok)return alert(JSON.stringify(out));clearPersonnelForm();await loadPersonnel();renderPersonnelManageList();status("Personnel saved.");}

function fillEquipmentOptions(){equipmentCurrentJobInput.innerHTML='<option value="">UNASSIGNED</option><option>SHOP</option>'+jobs.map(j=>`<option>${esc(j.name)}</option>`).join("");equipmentForemanInput.innerHTML='<option></option>'+personnelList.map(p=>`<option>${esc(p.full_name)}</option>`).join("");}
function clearEquipmentForm(){equipmentEditId.value="";equipmentNameInput.value="";equipmentNumberInput.value="";equipmentTypeInput.value="";equipmentStatusInput.value="Active";equipmentCurrentJobInput.value="";equipmentForemanInput.value="";equipmentNotesInput.value="";}
function renderEquipmentManageList(){let q=(equipmentSearch.value||"").toLowerCase();let filtered=equipmentList.filter(eq=>JSON.stringify(eq).toLowerCase().includes(q));equipmentManageList.innerHTML=filtered.length?filtered.map(eq=>`<div class="feedItem"><b>${esc(shortEquipmentName(eq.name))}</b><div class="meta">${esc(eq.equipment_type||"No type")} • ${esc(eq.equipment_number||"")}</div><div class="meta">Status: ${esc(eq.status||"Active")} • Site: ${esc(eq.current_job||"UNASSIGNED")}</div><div class="toolbar" style="margin-top:8px"><button class="secondary" data-edit-equipment="${esc(eq.id)}">Edit</button><button data-maintenance-equipment="${esc(eq.id)}">Maintenance Request</button></div></div>`).join(""):"No equipment found.";document.querySelectorAll("[data-edit-equipment]").forEach(btn=>btn.onclick=()=>{let eq=equipmentList.find(x=>x.id===btn.dataset.editEquipment);if(!eq)return;equipmentEditId.value=eq.id||"";equipmentNameInput.value=eq.name||"";equipmentNumberInput.value=eq.equipment_number||"";equipmentTypeInput.value=eq.equipment_type||"";equipmentStatusInput.value=eq.status||"Active";equipmentCurrentJobInput.value=eq.current_job||"";equipmentForemanInput.value=eq.assigned_foreman||"";equipmentNotesInput.value=eq.notes||"";});document.querySelectorAll("[data-maintenance-equipment]").forEach(btn=>btn.onclick=async()=>{let eq=equipmentList.find(x=>x.id===btn.dataset.maintenanceEquipment);if(!eq)return;equipmentDrawer.classList.add("hidden");await openWorkDrawer(null);workDepartment.value="Maintenance";renderWorkForm();setTimeout(()=>{if(document.getElementById("f_equipment"))f_equipment.value=eq.id;},0);});}
async function openEquipmentDrawer(){equipmentDrawer.classList.remove("hidden");await Promise.all([loadEquipment(),loadJobs(),loadPersonnel()]);fillEquipmentOptions();renderEquipmentManageList();}
async function saveEquipment(){let payload={name:equipmentNameInput.value.trim(),equipment_number:equipmentNumberInput.value.trim(),equipment_type:equipmentTypeInput.value,status:equipmentStatusInput.value||"Active",current_job:equipmentCurrentJobInput.value||null,assigned_foreman:equipmentForemanInput.value||null,notes:equipmentNotesInput.value.trim()};if(!payload.name)return alert("Enter equipment name.");let res;if(equipmentEditId.value)res=await apiFetch(rest("equipment","?id=eq."+equipmentEditId.value),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});else res=await apiFetch(rest("equipment"),{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(payload)});let out=await res.json().catch(()=>[]);if(!res.ok)return alert(JSON.stringify(out));clearEquipmentForm();await loadEquipment();renderEquipmentManageList();renderOperationsBoard();status("Equipment saved.");}

signInBtn.onclick=signIn;signUpBtn.onclick=signUp;logoutBtn.onclick=logout;refreshBtn.onclick=loadAll;calendarViewBtn.onclick=()=>switchMainView("calendar");operationsViewBtn.onclick=()=>switchMainView("operations");refreshBoardBtn.onclick=()=>{loadEquipment().then(renderOperationsBoard)};assignWorkBtn.onclick=()=>openWorkDrawer(null);newJobBtn.onclick=()=>openJobDrawer(null);personnelBtn.onclick=openPersonnelDrawer;equipmentBtn.onclick=openEquipmentDrawer;closeWorkDrawerBtn.onclick=closeWorkDrawer;closeJobDrawerBtn.onclick=()=>jobDrawer.classList.add("hidden");closePersonnelBtn.onclick=()=>personnelDrawer.classList.add("hidden");closeEquipmentBtn.onclick=()=>equipmentDrawer.classList.add("hidden");workDepartment.onchange=()=>renderWorkForm();sendWorkBtn.onclick=sendWork;clearWorkBtn.onclick=clearWorkForm;saveWorkBtn.onclick=saveWork;completeWorkBtn.onclick=completeWork;addUpdateBtn.onclick=addManualUpdate;deleteWorkBtn.onclick=deleteWork;openWorkDropboxBtn.onclick=()=>{let r=currentReq();openLinkSafe(r?.dropbox_link);};prevJobBtn.onclick=()=>switchJob(-1);nextJobBtn.onclick=()=>switchJob(1);jobAssignWorkBtn.onclick=async()=>{await openWorkDrawer(null);if(selectedJobId&&document.getElementById("f_job"))f_job.value=selectedJobId;};jobOpenDropboxBtn.onclick=()=>{let j=currentJob();openLinkSafe(j?.dropbox_link);};saveJobBtn.onclick=saveJob;deleteJobBtn.onclick=deleteJob;savePersonnelBtn.onclick=savePersonnel;clearPersonnelBtn.onclick=clearPersonnelForm;saveEquipmentBtn.onclick=saveEquipment;clearEquipmentBtn.onclick=clearEquipmentForm;equipmentSearch.oninput=renderEquipmentManageList;search.oninput=renderRequests;deptFilter.onchange=renderRequests;statusFilter.onchange=renderRequests;jobSearch.oninput=renderJobs;prevMonth.onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1);renderCalendar();};nextMonth.onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1);renderCalendar();};todayBtn.onclick=()=>{calendarDate=new Date();selectedDay=dateKey(new Date());renderAll();};
[workDrawer,jobDrawer,personnelDrawer,equipmentDrawer].forEach(d=>d.addEventListener("click",e=>{if(e.target===d)d.classList.add("hidden");}));

try{session=JSON.parse(localStorage.getItem("sb_session")||"null");}catch(e){session=null;}
if(session){startSessionAutoRefresh();loadProfile().then(()=>{setViews();loadAll();}).catch(logout);}else setViews();
