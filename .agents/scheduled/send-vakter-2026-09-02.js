const jwt = require('../../node_modules/jsonwebtoken');
const targetAt = new Date('2026-09-02T09:00:00.000Z');
const baseUrl = 'https://nestwork-shift-manager.replit.app';
const adminId = '62b122eb-fb3c-4cc1-a4db-f03d8e29fee6';
const targets = [
  { employeeId:'bb5e32b9-f7d6-4e6e-934e-95937dd828df', employee:'Roza Mohammed Alyoussef', kindergartenId:'74cd226f-96bb-42bd-9cb4-1cefdd05f575', kindergarten:'Lysekloster Barnehage', dato:'2026-09-03', startTid:'08:30:00', sluttTid:'16:00:00', region:'Os' },
  { employeeId:'bb5e32b9-f7d6-4e6e-934e-95937dd828df', employee:'Roza Mohammed Alyoussef', kindergartenId:'74cd226f-96bb-42bd-9cb4-1cefdd05f575', kindergarten:'Lysekloster Barnehage', dato:'2026-09-04', startTid:'08:30:00', sluttTid:'16:00:00', region:'Os' },
  { employeeId:'86e3abd8-6b76-4f01-8cd4-4b9d2bc11b5b', employee:'Gavin Mitchell', kindergartenId:'99caabb6-6068-42e4-8aad-defadbb578f2', kindergarten:'Espira Kuventræ Barnehage', dato:'2026-09-03', startTid:'08:15:00', sluttTid:'15:45:00', region:'Os' },
  { employeeId:'314fd982-1d6d-488c-b98d-d717fb358caa', employee:'Nora Berge Rognaldsen', kindergartenId:'99caabb6-6068-42e4-8aad-defadbb578f2', kindergarten:'Espira Kuventræ Barnehage', dato:'2026-09-03', startTid:'08:00:00', sluttTid:'14:45:00', region:'Os' }
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const overlaps = (a,b,c,d) => a < d && c < b;
async function main(){
  const wait = targetAt.getTime() - Date.now();
  if(wait > 0){ console.log(`AUTOMATION_WAITING until ${targetAt.toISOString()}`); await sleep(wait); }
  if(Date.now() > targetAt.getTime() + 30*60*1000) throw new Error('Tidsvinduet er utløpt; ingen vakter ble sendt');
  const token = jwt.sign({userId:adminId}, process.env.SESSION_SECRET, {expiresIn:'15m'});
  const auth = {Authorization:`Bearer ${token}`};
  async function api(path, init={}){
    const res=await fetch(baseUrl+path,{...init,headers:{...auth,...(init.headers||{})}});
    const body=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(`${init.method||'GET'} ${path}: HTTP ${res.status}: ${body.message||'ukjent feil'}`);
    return body;
  }
  const [users,kindergartens,shifts]=await Promise.all([api('/api/users'),api('/api/barnehager'),api('/api/vakter')]);
  for(const t of targets){
    const u=users.find(x=>x.id===t.employeeId), b=kindergartens.find(x=>x.id===t.kindergartenId);
    if(!u||u.name!==t.employee||u.status!=='Aktiv') throw new Error(`Ansatt er ikke entydig/aktiv: ${t.employee}`);
    if(!b||b.name!==t.kindergarten) throw new Error(`Barnehage er ikke entydig: ${t.kindergarten}`);
    const cal=await api(`/api/admin/availability/user/${t.employeeId}?month=2026-09`);
    if(cal.blockedDates.includes(t.dato)) throw new Error(`Blokkert dato for ${t.employee}: ${t.dato}`);
    if(cal.availability.find(a=>a.date===t.dato)?.status==='unavailable') throw new Error(`${t.employee} er utilgjengelig ${t.dato}`);
    const collision=shifts.find(v=>v.ansattId===t.employeeId&&v.dato===t.dato&&overlaps(v.startTid,v.sluttTid,t.startTid,t.sluttTid));
    if(collision) throw new Error(`Kollisjon for ${t.employee} ${t.dato}: ${collision.id}`);
  }
  const created=[];
  try{
    for(const t of targets){
      const v=await api('/api/vakter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({barnehageId:t.kindergartenId,dato:t.dato,startTid:t.startTid,sluttTid:t.sluttTid,vikarkode:'LTV',status:'tildelt',ansattId:t.employeeId,region:t.region,beskrivelse:''})});
      created.push({id:v.id,employee:t.employee,dato:t.dato,startTid:t.startTid,sluttTid:t.sluttTid});
    }
  }catch(err){
    for(const v of created.reverse()){try{await api(`/api/vakter/${v.id}`,{method:'DELETE'})}catch(e){console.error('ROLLBACK_ERROR '+e.message)}}
    throw err;
  }
  console.log('AUTOMATION_SUCCESS '+JSON.stringify(created));
}
main().catch(err=>{console.error('AUTOMATION_FAILED '+err.message);process.exitCode=1});
