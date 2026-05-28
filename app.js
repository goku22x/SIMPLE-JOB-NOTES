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
  if(r.department==="Mobilization" && r.equipment_name) return "Move: " + r.equipment_name;
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
async function loadPersonnel(){
  let res=await apiFetch(rest("personnel","?select=*&active=eq.true&order=full_name.asc"),{headers:headers()});
  let data=await res.json();
  personnelList=Array.isArray(data)?data:[];
  renderPersonnelOptionsForDepartment();
}

function renderPersonnelOptionsForDepartment(){
  const personSelect = document.getElementById("personnel");
  const deptSelect = document.getElementById("department");
  if(!personSelect || !deptSelect) return;

  const dept = String(deptSelect.value || "").trim().toLowerCase();
  const previous = personSelect.value;

  const filtered = personnelList.filter(p => {
    if(!dept) return true;
    return String(p.department || "").trim().toLowerCase() === dept;
  });

  personSelect.innerHTML =
    '<option></option>' +
    filtered.map(p => `<option value="${esc(p.full_name)}">${esc(p.full_name)}${p.role ? " / " + esc(p.role) : ""}</option>`).join("");

  if(previous && filtered.some(p => p.full_name === previous)){
    personSelect.value = previous;
  }else{
    personSelect.value = "";
  }
}

async function loadEquipment(){
  let res=await apiFetch(rest("equipment","?select=*&status=neq.Inactive&order=name.asc"),{headers:headers()});
  let data=await res.json();
  equipmentList=Array.isArray(data)?data:[];
  renderEquipmentOptions();
}
async function loadJobs(){let res=await apiFetch(rest("JOBS","?select=*&order=sort_order.asc,updated_at.desc"),{headers:headers()});let data=await res.json();jobs=(data||[]).map(normalizeJob);if(!selectedJobId&&jobs[0])selectedJobId=jobs[0].id;}
async function loadRequests(){let res=await apiFetch(rest("REQUESTS","?select=*&order=updated_at.desc"),{headers:headers()});let data=await res.json();if(!res.ok)throw new Error(JSON.stringify(data));requests=(data||[]).map(normalizeReq);}
async function loadUpdates(id){let res=await apiFetch(rest("request_updates","?select=*&request_id=eq."+id+"&order=created_at.desc"),{headers:headers()});let data=await res.json();updates=Array.isArray(data)?data:[];}

function ensureVisibleSelectedJob(){if(!selectedJobId||!jobs.find(j=>j.id===selectedJobId&&canSeeJob(j))){const first=jobs.find(canSeeJob);selectedJobId=first?first.id:null;}}
function renderAll(){ensureVisibleSelectedJob();renderJobs();renderRequests();renderCalendar();renderDayList();renderFeed();populateJobSelect();if(!jobDrawer.classList.contains("hidden"))renderJobOverview();if(typeof currentMainView!=="undefined"&&currentMainView==="operations")renderOperationsBoard();}
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

function renderEquipmentOptions(){if(!document.getElementById("equipment"))return;equipment.innerHTML='<option></option>'+equipmentList.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}${e.equipment_number?" — "+esc(e.equipment_number):""}${e.current_job?" @ "+esc(e.current_job):""}</option>`).join("");}
function toggleEquipmentField(){
  const showEquipment = department.value==="Mechanic" || department.value==="Mobilization";
  if(document.getElementById("equipmentStep")){
    equipmentStep.classList.toggle("hidden", !showEquipment);
  }
  if(document.getElementById("mechanicWrap")){
    mechanicWrap.classList.toggle("hidden", department.value!=="Mechanic");
  }
  if(!showEquipment && document.getElementById("equipment")) equipment.value="";
  renderEquipmentOptions();
}

function renderPersonnelManageList(){
  if(!personnelList.length){
    personnelManageList.innerHTML = "No personnel added yet.";
    return;
  }

  personnelManageList.innerHTML = personnelList.map(p=>`
    <div class="feedItem">
      <div><b>${esc(p.full_name || "Unnamed")}</b></div>
      <div class="meta">${esc(p.department || "No department")} • ${esc(p.role || "No role")}</div>
      <div class="meta">${esc(p.email || "")}${p.phone ? " • " + esc(p.phone) : ""}</div>
      ${p.notes ? `<div class="meta">${esc(p.notes)}</div>` : ""}
      <div class="toolbar" style="margin-top:8px">
        <button class="secondary" data-edit-personnel="${esc(p.id)}">Edit</button>
        <button class="danger" data-disable-personnel="${esc(p.id)}">Deactivate</button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-edit-personnel]").forEach(btn=>{
    btn.onclick=()=>{
      const p = personnelList.find(x=>x.id===btn.dataset.editPersonnel);
      if(!p) return;
      personnelId.value=p.id || "";
      personnelName.value=p.full_name || "";
      personnelDepartment.value=p.department || "";
      personnelRole.value=p.role || "";
      personnelEmail.value=p.email || "";
      personnelPhone.value=p.phone || "";
      personnelNotes.value=p.notes || "";
    };
  });

  document.querySelectorAll("[data-disable-personnel]").forEach(btn=>{
    btn.onclick=async()=>{
      if(!confirm("Deactivate this person?")) return;
      let res = await apiFetch(rest("personnel","?id=eq."+btn.dataset.disablePersonnel),{
        method:"PATCH",
        headers:headers({"Prefer":"return=representation"}),
        body:JSON.stringify({active:false})
      });
      if(!res.ok) return alert("Could not deactivate person: " + await res.text());
      await loadPersonnel();
      renderPersonnelManageList();
      status("Personnel deactivated.");
    };
  });
}

async function openPersonnelDrawer(){
  personnelDrawer.classList.remove("hidden");
  await loadPersonnel();
  renderPersonnelManageList();
}

async function savePersonnel(){
  const payload = {
    full_name: personnelName.value.trim(),
    department: personnelDepartment.value,
    role: personnelRole.value.trim(),
    email: personnelEmail.value.trim(),
    phone: personnelPhone.value.trim(),
    notes: personnelNotes.value.trim(),
    active: true
  };

  if(!payload.full_name) return alert("Enter a full name.");

  let res;
  if(personnelId.value){
    res = await apiFetch(rest("personnel","?id=eq."+personnelId.value),{
      method:"PATCH",
      headers:headers({"Prefer":"return=representation"}),
      body:JSON.stringify(payload)
    });
  }else{
    res = await apiFetch(rest("personnel"),{
      method:"POST",
      headers:headers({"Prefer":"return=representation"}),
      body:JSON.stringify(payload)
    });
  }

  const out = await res.json().catch(()=>[]);
  if(!res.ok) return alert("Save personnel failed: " + JSON.stringify(out));

  clearPersonnelForm();
  await loadPersonnel();
  renderPersonnelManageList();
  status("Personnel saved.");
}


let currentMainView = "calendar";

function equipmentTypeColor(type){
  type = String(type||"").toLowerCase();

  if(type.includes("dozer")) return "#facc15";
  if(type.includes("excavator") || type.includes("trackhoe")) return "#fb923c";
  if(type.includes("truck") || type.includes("lowboy")) return "#60a5fa";
  if(type.includes("roller")) return "#4ade80";
  if(type.includes("skid")) return "#c084fc";
  if(type.includes("backhoe") || type.includes("loader")) return "#a3e635";
  if(type.includes("survey")) return "#a78bfa";
  if(type.includes("sweeper")) return "#94a3b8";

  return "#d1d5db";
}

function equipmentStatusBorder(status){
  status = String(status||"").toLowerCase();

  if(status.includes("down")) return "4px solid #dc2626";
  if(status.includes("shop")) return "4px solid #f97316";

  return "2px solid #d1d5db";
}

function switchMainView(view){
  currentMainView = view;

  calendarView.classList.toggle("hidden", view !== "calendar");
  operationsView.classList.toggle("hidden", view !== "operations");

  calendarViewBtn.classList.toggle("secondary", view !== "calendar");
  operationsViewBtn.classList.toggle("secondary", view !== "operations");

  if(view === "operations"){
    renderOperationsBoard();
  }
}

function renderOperationsBoard(){
  const board = document.getElementById("operationsBoard");

  const grouped = {};

  jobs.forEach(j=>{
    grouped[j.name] = [];
  });

  grouped["SHOP"] = [];
  grouped["UNASSIGNED"] = [];

  equipmentList.forEach(eq=>{
    const jobName = eq.current_job || "UNASSIGNED";

    if(!grouped[jobName]){
      grouped[jobName] = [];
    }

    grouped[jobName].push(eq);
  });

  board.innerHTML = `
    <div style="
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
      gap:14px;
      margin-top:12px;
    ">
      ${Object.entries(grouped).map(([job,equipment])=>`
        <div
          class="card"
          style="
            min-height:280px;
            background:#f9fafb;
          "
          data-board-job="${esc(job)}"
        >
          <h3 style="margin-top:0">${esc(job)}</h3>

          ${equipment.length ? equipment.map(eq=>`
            <div
              draggable="true"
              data-equipment-id="${esc(eq.id)}"
              class="equipmentCard"
              style="
                margin-top:10px;
                border-radius:14px;
                padding:12px;
                background:${equipmentTypeColor(eq.equipment_type)};
                border:${equipmentStatusBorder(eq.status)};
                cursor:grab;
              "
            >
              <div style="font-weight:900">${esc(eq.name)}</div>

              <div style="font-size:12px;margin-top:4px">
                ${esc(eq.equipment_type || "Equipment")}${eq.equipment_number ? " • " + esc(eq.equipment_number) : ""}
              </div>

              <div style="font-size:12px;margin-top:4px">
                Status: ${esc(eq.status || "Active")}
              </div>

              ${eq.assigned_foreman ? `
                <div style="font-size:12px;margin-top:4px">
                  Foreman: ${esc(eq.assigned_foreman)}
                </div>
              ` : ""}
            </div>
          `).join("") : `
            <div class="muted" style="margin-top:12px">
              No equipment assigned.
            </div>
          `}
        </div>
      `).join("")}
    </div>
  `;

  document.querySelectorAll("[data-board-job]").forEach(col=>{
    col.addEventListener("dragover", e=>{
      e.preventDefault();
    });

    col.addEventListener("drop", async e=>{
      e.preventDefault();

      const equipmentId = window.__dragEquipmentId;
      const targetJob = col.dataset.boardJob;

      if(!equipmentId) return;

      let payload = {
        current_job: targetJob === "UNASSIGNED" ? null : targetJob
      };

      let res = await apiFetch(
        rest("equipment","?id=eq."+equipmentId),
        {
          method:"PATCH",
          headers:headers({"Prefer":"return=representation"}),
          body:JSON.stringify(payload)
        }
      );

      if(!res.ok){
        alert("Could not move equipment.");
        return;
      }

      await loadEquipment();

      renderOperationsBoard();

      status("Equipment moved.");
    });
  });

  document.querySelectorAll("[data-equipment-id]").forEach(card=>{
    card.addEventListener("dragstart", ()=>{
      window.__dragEquipmentId = card.dataset.equipmentId;
    });

    card.addEventListener("dragend", ()=>{
      window.__dragEquipmentId = null;
    });
  });
}

calendarViewBtn.onclick=()=>switchMainView("calendar");operationsViewBtn.onclick=()=>switchMainView("operations");
function fillEquipmentJobOptions(){
  if(!document.getElementById("equipmentCurrentJobInput")) return;
  equipmentCurrentJobInput.innerHTML = '<option value="">UNASSIGNED</option><option>SHOP</option>' + jobs.map(j=>`<option>${esc(j.name)}</option>`).join("");
}

function fillEquipmentForemanOptions(){
  if(!document.getElementById("equipmentForemanInput")) return;
  equipmentForemanInput.innerHTML = '<option></option>' + personnelList.map(p=>`<option>${esc(p.full_name)}</option>`).join("");
}

function clearEquipmentForm(){
  equipmentEditId.value="";
  equipmentNameInput.value="";
  equipmentNumberInput.value="";
  equipmentTypeInput.value="";
  equipmentStatusInput.value="Active";
  equipmentCurrentJobInput.value="";
  equipmentForemanInput.value="";
  equipmentNotesInput.value="";
}

function renderEquipmentManageList(){
  if(!document.getElementById("equipmentManageList")) return;

  const q = (equipmentSearch?.value || "").toLowerCase();

  const filtered = equipmentList.filter(eq => JSON.stringify(eq).toLowerCase().includes(q));

  equipmentManageList.innerHTML = filtered.length ? filtered.map(eq=>`
    <div class="feedItem">
      <div><b>${esc(eq.name || "Unnamed Equipment")}</b></div>
      <div class="meta">${esc(eq.equipment_type || "No type")} • ${esc(eq.equipment_number || eq.asset_id || "")}</div>
      <div class="meta">Status: ${esc(eq.status || "Active")} • Site: ${esc(eq.current_job || "UNASSIGNED")}</div>
      ${eq.assigned_foreman ? `<div class="meta">Foreman: ${esc(eq.assigned_foreman)}</div>` : ""}
      ${eq.notes ? `<div class="meta">${esc(eq.notes)}</div>` : ""}
      <div class="toolbar" style="margin-top:8px">
        <button class="secondary" data-edit-equipment="${esc(eq.id)}">Edit</button>
        <button data-maintenance-equipment="${esc(eq.id)}">Maintenance Request</button>
      </div>
    </div>
  `).join("") : "No equipment found.";

  document.querySelectorAll("[data-edit-equipment]").forEach(btn=>{
    btn.onclick=()=>{
      const eq = equipmentList.find(x=>x.id===btn.dataset.editEquipment);
      if(!eq) return;
      equipmentEditId.value=eq.id || "";
      equipmentNameInput.value=eq.name || "";
      equipmentNumberInput.value=eq.equipment_number || eq.asset_id || "";
      equipmentTypeInput.value=eq.equipment_type || "";
      equipmentStatusInput.value=eq.status || "Active";
      equipmentCurrentJobInput.value=eq.current_job || "";
      equipmentForemanInput.value=eq.assigned_foreman || "";
      equipmentNotesInput.value=eq.notes || "";
    };
  });

  document.querySelectorAll("[data-maintenance-equipment]").forEach(btn=>{
    btn.onclick=async()=>{
      const eq = equipmentList.find(x=>x.id===btn.dataset.maintenanceEquipment);
      if(!eq) return;
      equipmentDrawer.classList.add("hidden");
      await openRequestDrawer(null);
      department.value="Mechanic";
      updateProgressiveForm();
      equipment.value=eq.id;
      description.value="";
      mechanicSeverity.value = eq.status==="Down" ? "Down / Cannot Work" : "Normal";
      canOperate.value = eq.status==="Down" ? "No" : "Unknown";
      if(eq.current_job){
        const job = jobs.find(j=>j.name===eq.current_job);
        if(job) requestJobSelect.value = job.id;
      }
    };
  });
}

async function openEquipmentDrawer(){
  equipmentDrawer.classList.remove("hidden");
  await Promise.all([loadEquipment(), loadJobs(), loadPersonnel()]);
  fillEquipmentJobOptions();
  fillEquipmentForemanOptions();
  renderEquipmentManageList();
}

async function saveEquipment(){
  const payload = {
    name: equipmentNameInput.value.trim(),
    equipment_number: equipmentNumberInput.value.trim(),
    equipment_type: equipmentTypeInput.value,
    status: equipmentStatusInput.value || "Active",
    current_job: equipmentCurrentJobInput.value || null,
    assigned_foreman: equipmentForemanInput.value || null,
    notes: equipmentNotesInput.value.trim()
  };

  if(!payload.name) return alert("Enter equipment name.");

  let res;
  if(equipmentEditId.value){
    res = await apiFetch(rest("equipment","?id=eq."+equipmentEditId.value),{
      method:"PATCH",
      headers:headers({"Prefer":"return=representation"}),
      body:JSON.stringify(payload)
    });
  }else{
    res = await apiFetch(rest("equipment"),{
      method:"POST",
      headers:headers({"Prefer":"return=representation"}),
      body:JSON.stringify(payload)
    });
  }

  const out = await res.json().catch(()=>[]);
  if(!res.ok) return alert("Save equipment failed: " + JSON.stringify(out));

  clearEquipmentForm();
  await loadEquipment();
  renderEquipmentManageList();
  if(typeof currentMainView !== "undefined" && currentMainView === "operations") renderOperationsBoard();
  status("Equipment saved.");
}

equipmentBtn.onclick=openEquipmentDrawer;closeEquipmentBtn.onclick=()=>equipmentDrawer.classList.add("hidden");saveEquipmentBtn.onclick=saveEquipment;clearEquipmentBtn.onclick=clearEquipmentForm;equipmentSearch.oninput=renderEquipmentManageList;signInBtn.onclick=signIn;signUpBtn.onclick=signUp;logoutBtn.onclick=logout;refreshBtn.onclick=loadAll;if(document.getElementById("personnelBtn")) personnelBtn.onclick=openPersonnelDrawer;
if(document.getElementById("closePersonnelBtn")) closePersonnelBtn.onclick=()=>personnelDrawer.classList.add("hidden");
if(document.getElementById("savePersonnelBtn")) savePersonnelBtn.onclick=savePersonnel;
if(document.getElementById("clearPersonnelBtn")) clearPersonnelBtn.onclick=clearPersonnelForm;newJobBtn.onclick=()=>openJobDrawer(null);assignWorkBtn.onclick=async()=>{selectedId=null;await openRequestDrawer(null);requestJobSelect.value="";};closeDrawerBtn.onclick=closeDrawer;closeJobDrawerBtn.onclick=()=>jobDrawer.classList.add("hidden");prevJobBtn.onclick=()=>switchJob(-1);nextJobBtn.onclick=()=>switchJob(1);jobAssignWorkBtn.onclick=async()=>{await openRequestDrawer(null);requestJobSelect.value=selectedJobId||"";};jobOpenDropboxBtn.onclick=()=>{let j=currentJob();if(j?.dropbox_link)window.open(j.dropbox_link,"_blank");};department.onchange=updateProgressiveForm;equipment.onchange=updateProgressiveForm;requestJobSelect.onchange=updateProgressiveForm;clearFormBtn.onclick=()=>{selectedId=null;clearRequestForm();feed.innerHTML='<div class="meta">Form cleared.</div>';};sendBtn.onclick=sendRequest;completeBtn.onclick=completeWork;saveEditBtn.onclick=saveEdit;addUpdateBtn.onclick=addManualUpdate;deleteBtn.onclick=deleteRequest;saveJobBtn.onclick=saveJob;deleteJobBtn.onclick=deleteJob;search.oninput=renderRequests;deptFilter.onchange=renderRequests;statusFilter.onchange=renderRequests;jobSearch.oninput=renderJobs;prevMonth.onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1);renderCalendar();};nextMonth.onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1);renderCalendar();};todayBtn.onclick=()=>{calendarDate=new Date();selectedDay=dateKey(new Date());renderAll();};
jobDrawer.addEventListener("click",e=>{if(e.target===jobDrawer)jobDrawer.classList.add("hidden");});
drawer.addEventListener("click",e=>{if(e.target===drawer)drawer.classList.add("hidden");});
equipmentDrawer.addEventListener("click",e=>{if(e.target===equipmentDrawer)equipmentDrawer.classList.add("hidden");});
personnelDrawer.addEventListener("click",e=>{if(e.target===personnelDrawer)personnelDrawer.classList.add("hidden");});


// Department/personnel filter fallback.
document.addEventListener("change", function(e){
  if(e.target && e.target.id === "department"){
    renderPersonnelOptionsForDepartment();
  }
});


// Safe personnel helper fallbacks.
if(typeof clearPersonnelForm !== "function"){
  function clearPersonnelForm(){
    ["personnelId","personnelName","personnelDepartment","personnelRole","personnelEmail","personnelPhone","personnelNotes"].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.value="";
    });
  }
}
if(typeof openPersonnelDrawer !== "function"){
  async function openPersonnelDrawer(){
    const drawer=document.getElementById("personnelDrawer");
    if(drawer) drawer.classList.remove("hidden");
    alert("Personnel page is not included in this build.");
  }
}
if(typeof savePersonnel !== "function"){
  async function savePersonnel(){
    alert("Personnel saving is not included in this build.");
  }
}

try{session=JSON.parse(localStorage.getItem("sb_session")||"null");}catch(e){session=null;}
if(session){startSessionAutoRefresh();loadProfile().then(()=>{setViews();loadAll();}).catch(logout);}else setViews();
