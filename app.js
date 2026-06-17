// 수진동 4427 투자 대시보드 — v5
// 2025 수진1-기준 감평 → 미래 예측 2방식(지가상승률 / 분양가 역산) → 현금청산 현금흐름·세금·IRR
let A=null, state={}, jiga=null, activeTab="summary";
let scenarioChart, jigaChart, cashflowChart;
let jigaDrag=null, jigaSel=null; // 드래그 픽셀{a,b}, 선택 인덱스{i0,i1}
// 선택 구간 음영 플러그인
const dragSelPlugin={id:"dragsel",afterDraw(ch){ if(!jigaDrag)return; const {ctx,chartArea}=ch;
  const x0=Math.min(jigaDrag.a,jigaDrag.b),x1=Math.max(jigaDrag.a,jigaDrag.b);
  ctx.save(); ctx.fillStyle="rgba(240,210,138,.15)"; ctx.fillRect(x0,chartArea.top,x1-x0,chartArea.bottom-chartArea.top);
  ctx.strokeStyle="rgba(240,210,138,.6)"; ctx.lineWidth=1; ctx.strokeRect(x0,chartArea.top,x1-x0,chartArea.bottom-chartArea.top); ctx.restore(); }};
const NOW=new Date().getFullYear(), BASE_YEAR=2025;
const PAL=["#f0d28a","#7fe3ff","#5fe09a","#ff8a8a"];

const won=v=>{ if(v==null||isNaN(v))return"—"; const s=v<0?"-":"";v=Math.abs(v);
  const e=Math.floor(v/10000),m=Math.round(v%10000);
  if(e&&m)return `${s}${e}억 ${m.toLocaleString()}만`; if(e)return `${s}${e}억`; return `${s}${m.toLocaleString()}만`;};
const eok=v=>(v==null||isNaN(v))?"—":(v/10000).toFixed(2)+"억";
const pct=v=>(v==null||isNaN(v))?"—":(v*100).toFixed(1)+"%";
const aPV=(r,n)=>r===0?n:(1-Math.pow(1+r,-n))/r, aFV=(r,n)=>r===0?n:(Math.pow(1+r,n)-1)/r;

// 공통 슬라이더
const BASE_CTRL=[
  ["purchase","매입가",200000,600000,5000,"만원"],
  ["ltv","대출 LTV",0,0.9,0.05,"%"],
  ["rate","대출금리",0.02,0.08,0.001,"%"],
  ["monthlyRent","월 임대료",0,2000,50,"만원"],
  ["landPerPyeong","토지 평당가(2025)",3000,4500,50,"만원/평"],
  ["yearsToApp","감평까지 연수",1,15,1,"년"],
  ["haircut","개발이익 배제율",0,0.40,0.01,"%"],
  ["litUplift","소송 증액률",0,0.30,0.01,"%"],
  ["standalonePerPyeong","무산 시 평당가",3000,9000,100,"만원/평"],
];

async function init(){
  A=await(await fetch("model/assumptions.json")).json();
  try{ jiga=parseJiga(await(await fetch("data/landprice-jigato-2000-2025.csv")).text()); }catch(e){ jiga=null; }
  const v=A.valuation,f=A.financing,fp=A.future_prediction,t=A.cashflow_timeline;
  state={
    purchase:f.purchase_price_manwon??360000, ltv:f.ltv??0.7, rate:f.interest_rate??0.045,
    monthlyRent:A.lease.monthly_rent_full_manwon??1000,
    landPerPyeong:v.land.applied_per_pyeong_4427_manwon??3800,
    yearsToApp:(t.year_appraisal-BASE_YEAR)||6,
    haircut:A.exit_cash_settlement.dev_profit_exclusion_haircut??0,
    growth:v.timepoint_adjustment.annual_land_growth_rate??0.045,
    presale:fp.presale_general_eok??13.5,
    litUplift:A.exit_cash_settlement.litigation_uplift??0.15,
    standalonePerPyeong:fp.standalone_per_pyeong_manwon??6000,
    method:fp.method_default||"growth",
  };
  state.totalGrowth=Math.pow(1+state.growth,state.yearsToApp)-1;
  buildMethodToggle(); buildControls(); buildTabs(); render();
}
function parseJiga(txt){
  const rows=txt.trim().split("\n").map(l=>l.split(","));
  const years=rows[0].slice(2).map(Number), series={}, rate={};
  rows.slice(1).forEach(r=>{ const v=r.slice(2).map(x=>x===""?null:Number(x));
    if(r[0].startsWith("지가지수")) series[r[1]]=v;
    else if(r[0].startsWith("지가변동률")) rate[r[1]]=v; });
  return {years,series,rate};
}
function buildMethodToggle(){
  const box=document.getElementById("methodToggle"); box.innerHTML="";
  [["growth","지가상승률"],["presale","분양가 역산"]].forEach(([k,l])=>{
    const b=document.createElement("button"); b.textContent=l; b.className=state.method===k?"active":"";
    b.onclick=()=>{ state.method=k; buildMethodToggle(); renderCtrlInto("methodControls",methodCtrl()); render(); };
    box.appendChild(b);
  });
}
function methodCtrl(){
  if(state.method==="growth") return [
    ["growth","연 지가상승률",0,0.10,0.005,"%"],
    ["totalGrowth","총 지가상승률",0,1.2,0.01,"%"],
  ];
  return [["presale","일반분양가(84·사시)",10,26,0.5,"억"]];
}
const TIP={
  purchase:"매입 호가(만원). 손익분기·IRR의 출발점",
  ltv:"대출 비율. 70% = 매입가의 70%를 1금융 대출(이자만)",
  rate:"대출 금리(연). 이자만 납부 가정",
  monthlyRent:"월 임대료(만실 기준). 2층 임대 시 월 1,000만",
  landPerPyeong:"2025 수진1-기준 4427 토지 평당 감정가. 92번지(코너) 앵커 3,700~3,900만",
  yearsToApp:"수진2 사업시행인가=감평 기준시점까지 연수. 청산은 +1년, 소송은 +3년 후",
  haircut:"토지보상법 개발이익 배제 할인율. 기본 0(앵커가 이미 감정 기준). 보수 검증 시 ↑",
  litUplift:"협의보상 불복 → 수용재결·행정소송으로 받는 추가 증액률(2035 별도 수령)",
  standalonePerPyeong:"재개발 무산 시 4427을 대로변 건물로 매각할 때 토지 평당가. 2031 수진1 완공·출입구 건너 입지 반영(기본 6,000만)",
  growth:"연 지가상승률. R-ONE 수정구 CAGR 근거(보수3.5/기준4.5/낙관5.5%)",
  totalGrowth:"감평까지 누적 총 지가상승률(연율과 자동 연동)",
  presale:"2032 수진2 사시 기준 84타입 일반분양가(사시 책자 추정치). 수진1 12.6억·신흥1 13.6억. ×0.385=20평단독 감정",
};
function renderCtrlInto(boxId, list){
  const box=document.getElementById(boxId); box.innerHTML="";
  list.forEach(([key,label,min,max,step,unit])=>{
    const d=document.createElement("div"); d.className="control"; d.title=TIP[key]||"";
    d.innerHTML=`<label>${label} <span class="qm">?</span></label><div class="row">
      <input type="range" id="c_${key}" min="${min}" max="${max}" step="${step}" value="${state[key]}">
      <span class="val" id="v_${key}"></span></div>`;
    box.appendChild(d);
    d.querySelector("input").addEventListener("input",ev=>onCtrl(key,parseFloat(ev.target.value),unit));
    lab(key,unit);
  });
}
function buildControls(){
  renderCtrlInto("baseControls", BASE_CTRL);
  renderCtrlInto("methodControls", methodCtrl());
  updateTimeline();
}
function updateTimeline(){
  const el=document.getElementById("tmln"); if(!el)return;
  const buy=A.cashflow_timeline.year_buy, aY=BASE_YEAR+state.yearsToApp, sY=aY+1, litY=sY+3;
  el.innerHTML=`매입 <b>${buy}</b> → 감평 <b>${aY}</b> → <b>청산 ${sY}</b>${state.litUplift>0?` → 소송 <b>${litY}</b>`:""}`;
}
function onCtrl(key,val,unit){
  state[key]=val;
  // 연간 ↔ 총 상승률 연동
  if(key==="growth"){ state.totalGrowth=Math.pow(1+val,state.yearsToApp)-1; setS("totalGrowth","%"); }
  if(key==="totalGrowth"){ state.growth=Math.pow(1+val,1/state.yearsToApp)-1; setS("growth","%"); }
  if(key==="yearsToApp" && state.method==="growth"){ state.totalGrowth=Math.pow(1+state.growth,val)-1; setS("totalGrowth","%"); }
  lab(key,unit); updateTimeline(); render();
}
function lab(key,unit){const el=document.getElementById("v_"+key);if(!el)return;const v=state[key];
  el.textContent = unit==="%"?(v*100).toFixed(1)+"%" : unit==="년"?v+"년" : unit==="억"?v+"억"
    : v.toLocaleString()+(unit.includes("평")?" 만/평":" 만");}
function setS(key,unit){const el=document.getElementById("c_"+key);if(el)el.value=state[key];lab(key,unit);}
function buildTabs(){
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
    activeTab=b.dataset.tab;
    document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
    document.querySelectorAll(".tabpane").forEach(p=>p.classList.toggle("active",p.id==="tab-"+activeTab));
    render();
  }));
}

// ===== 계산 =====
function building(year){
  const b=A.valuation.building,p=A.property;
  const cost=(b.replacement_cost_per_pyeong_won[p.building_structure]||0)/10000;
  const dur=b.durable_years[p.building_structure]||50;
  const residual=Math.max(b.residual_floor,(dur-(year-p.build_year))/dur);
  const infl=Math.pow(1+(b.construction_cost_inflation||0),year-NOW);
  return {val:p.building_gfa_pyeong*cost*infl*residual, cost:cost*infl, residual, dur, age:year-p.build_year};
}
function corpTax(base){const t=A.tax,th=t.corp_tax_threshold_manwon;
  return base<=0?0:Math.min(base,th)*t.corp_tax_rate_low+Math.max(base-th,0)*t.corp_tax_rate_high;}
function landFuture(method){
  const p=A.property, land2025=p.land_area_pyeong*state.landPerPyeong; // 만원 (방식A 앵커·standalone용)
  if(method==="presale"){
    const fp=A.future_prediction;
    const johap=state.presale*fp.johap_ratio;          // 84 조합원분양가(억)
    const j20=johap*fp.appraisal_ratio;                // 수진2 20평 단독 감정(억) = presale×0.385
    const ratio=j20/fp.sujin1_20pyeong_appraisal_eok;  // 수진2 ÷ 수진1(4.8억)
    const perPyeong=fp.sujin1_mainroad_per_pyeong_manwon*ratio; // 4427 토지평당 = 대로변4800 × 비율
    return {val:p.land_area_pyeong*perPyeong, johap, j20, ratio, perPyeong, land2025};
  }
  const mult=Math.pow(1+state.growth,state.yearsToApp);
  return {val:land2025*mult, mult, land2025};
}
function buildCtx(method){
  const p=A.property,ac=A.acquisition_costs,oc=A.operating_costs,cr=A.cashflow_rules,t=A.tax,tl=A.cashflow_timeline;
  const years=state.yearsToApp, appraisalYear=BASE_YEAR+years, settlementYear=appraisalYear+1, litYear=settlementYear+3, buyYear=tl.year_buy, holding=settlementYear-buyYear;
  const lf=landFuture(method), bld=building(appraisalYear);
  const marketApp=lf.val+bld.val, appraisalBase=marketApp*(1-state.haircut);
  const acqTax=state.purchase*ac.acquisition_tax_rate, broker=state.purchase*ac.brokerage_rate, legal=ac.legal_etc_manwon;
  const totalCost=state.purchase+acqTax+broker+legal, loan=state.purchase*state.ltv, deposit=A.lease.deposit_manwon, equity=totalCost-loan-deposit;
  const annualRent=state.monthlyRent*12, interest=loan*state.rate, maint=oc.maintenance_annual_manwon, ptax=oc.property_tax_annual_manwon;
  const opCF=annualRent-interest-maint-ptax;
  let preFund=0,opAccum=0;
  if(opCF<0) preFund=-opCF*aPV(cr.deposit_rate,holding); else opAccum=opCF*aFV(cr.reinvest_rate,holding);
  const investPrincipal=equity+preFund;
  const annualDep=totalCost*t.depreciation_building_ratio/t.depreciation_useful_life;
  const bookValue=totalCost-annualDep*holding;
  const annualTaxInc=annualRent-interest-maint-ptax-annualDep, lossCarry=annualTaxInc<0?-annualTaxInc*holding:0;
  return {method,years,appraisalYear,settlementYear,litYear,buyYear,holding,lf,bld,marketApp,appraisalBase,
    acqTax,broker,legal,totalCost,loan,deposit,equity,annualRent,interest,maint,ptax,opCF,preFund,opAccum,investPrincipal,
    annualDep,bookValue,lossCarry};
}
function outcome(c,settlement,withLit){
  const e=A.exit_cash_settlement;
  const recoverGross=settlement-c.loan-c.deposit+c.opAccum;
  const dispGain=settlement-c.bookValue, taxBase=Math.max(dispGain-c.lossCarry,0), tax=corpTax(taxBase), recoverNet=recoverGross-tax;
  let litGross=0,litNet=0;
  if(withLit){ litGross=settlement*state.litUplift*(1-e.litigation_success_fee); litNet=litGross-corpTax(litGross); }
  const preTaxTotal=recoverGross+litGross-c.investPrincipal, afterTaxTotal=recoverNet+litNet-c.investPrincipal;
  const end=withLit?c.litYear:c.settlementYear, fAft=[],fPre=[]; for(let y=c.buyYear;y<=end;y++){fAft.push(0);fPre.push(0);}
  fAft[0]=-c.investPrincipal; fAft[c.settlementYear-c.buyYear]+=recoverNet; if(withLit)fAft[c.litYear-c.buyYear]+=litNet;
  fPre[0]=-c.investPrincipal; fPre[c.settlementYear-c.buyYear]+=recoverGross; if(withLit)fPre[c.litYear-c.buyYear]+=litGross;
  return {settlement,recoverGross,dispGain,taxBase,tax,recoverNet,litGross,litNet,preTaxTotal,afterTaxTotal,irrAfter:irr(fAft),irrPre:irr(fPre),flows:fAft};
}
function irr(f){let lo=-.95,hi=3;const npv=r=>f.reduce((a,x,i)=>a+x/Math.pow(1+r,i),0);
  if(npv(lo)*npv(hi)>0)return null;for(let i=0;i<200;i++){const m=(lo+hi)/2;if(npv(m)>0)lo=m;else hi=m;}return(lo+hi)/2;}
function full(method){const c=buildCtx(method);return Object.assign(c,outcome(c,c.appraisalBase,true));}
// 무산: 대로변 건물 매각 가정. 자산가치 = 평당가 × 대지(러프). 세후 회수까지 산출.
function standalone(){
  const c=buildCtx(state.method);
  const assetValue=state.standalonePerPyeong*A.property.land_area_pyeong;   // 만원
  const net=assetValue-c.loan-c.deposit;                                   // 매각 순회수(세전)
  const dispGain=assetValue-c.bookValue, taxBase=Math.max(dispGain-c.lossCarry,0), tax=corpTax(taxBase);
  const netAfter=net-tax;
  return {assetValue,net,netAfter,tax,total:netAfter-c.investPrincipal,perPyeong:state.standalonePerPyeong,
    loan:c.loan,deposit:c.deposit,investPrincipal:c.investPrincipal};
}
function breakEvenAppraisal(c){let lo=0,hi=2000000;const f=s=>outcome(c,s,true).afterTaxTotal;if(f(hi)<0)return null;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(f(m)<0)lo=m;else hi=m;}return(lo+hi)/2;}

// ===== 렌더 =====
function render(){ renderSummary(); if(activeTab==="valuation")renderValuation(); if(activeTab==="cashflow")renderCashflow(); }
const card=(k,v,cls="")=>`<div class="card"><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
// 두 평가방법 값을 "금액(평가방법)" 형식으로 병기하는 카드
const card2=(k,gv,pv,fmt,cls="")=>`<div class="card"><div class="k">${k}</div><div class="v2 ${cls}">`
  +`<div><span>${fmt(gv)}</span><i>지가상승률</i></div>`
  +`<div><span>${fmt(pv)}</span><i>분양가역산</i></div></div></div>`;
const mlabel=()=>state.method==="growth"?"지가상승률":"분양가 역산";
// 선택된 미래감평 예측방식 배지 (혼동 방지)
const methodFull=()=>state.method==="growth"?"방식A · 지가상승률":"방식B · 분양가역산";
const methodBadge=(prefix="선택된 미래감평 예측방식")=>`<div class="mbadge ${state.method}">${prefix}: <b>${methodFull()}</b></div>`;

const rng=(a,b,fmt)=>{const lo=Math.min(a,b),hi=Math.max(a,b);return Math.abs(a-b)<1e-6?fmt(a):`${fmt(lo)} ~ ${fmt(hi)}`;};
function renderSummary(){
  const r=full(state.method), g=full("growth"), pr=full("presale"), sa=standalone(), be=breakEvenAppraisal(g);
  const irrALo=Math.min(g.irrAfter,pr.irrAfter), irrAHi=Math.max(g.irrAfter,pr.irrAfter);
  const irrPLo=Math.min(g.irrPre,pr.irrPre), irrPHi=Math.max(g.irrPre,pr.irrPre);
  // 타임라인
  const buy=A.cashflow_timeline.year_buy;
  const tl=[["매입",buy],["감평",r.appraisalYear],["청산",r.settlementYear]]; if(state.litUplift>0)tl.push(["소송",r.litYear]);
  document.getElementById("sumTimeline").innerHTML=tl.map((t,i)=>
    `<div class="tnode"><span class="yr">${t[1]}</span><span>${t[0]}</span></div>`+(i<tl.length-1?`<div class="tbar"></div>`:""))
    .join("")+`<div class="tnode"><span class="yr">${r.settlementYear-buy}년</span><span>보유(청산까지)</span></div>`;
  const mLine=(nm,x,active)=>`<div class="vl${active?' on':''}"><b class="mname">${nm}</b>`
    +` 미래감평 <b>${eok(x.marketApp)}</b>(${r.appraisalYear})`
    +` <span class="plus">+ 세전 수용재결 ${eok(x.litGross)}</span> = 세전 청산금 <b class="tot">${eok(x.settlement+x.litGross)}</b>`
    +` → 세후 총회수 ${eok(x.recoverNet+x.litNet)} · 세후수익 <b class="${x.afterTaxTotal>=0?'g':'b'}">${eok(x.afterTaxTotal)}</b>(IRR ${pct(x.irrAfter)})</div>`;
  document.getElementById("verdict").innerHTML=
    mLine("방식A 지가상승률",g,state.method==="growth")
    +mLine("방식B 분양가역산",pr,state.method==="presale")
    +`<div class="vl sub">소송(수용재결) 증액률 +${pct(state.litUplift)} 적용(${r.litYear} 별도수령) · `
    +`손익분기 감평가 ≈ <b>${eok(be)}</b> · 무산 시 매각 <b>${eok(sa.assetValue)}</b> → 세후 ${eok(sa.total)}</div>`;
  document.getElementById("cards").innerHTML=
    card2("미래 감평가("+r.appraisalYear+")",g.marketApp,pr.marketApp,eok)+
    card2("세전 수용재결 증액("+r.litYear+")",g.litGross,pr.litGross,eok)+
    card2("세전 청산금 (감평+증액)",g.settlement+g.litGross,pr.settlement+pr.litGross,eok)+
    card2("세후 총회수(청산+수용재결)",g.recoverNet+g.litNet,pr.recoverNet+pr.litNet,eok)+
    card2("세후 총수익(원금차감)",g.afterTaxTotal,pr.afterTaxTotal,eok,irrALo>=0?"good":"bad")+
    card2("세후 IRR",g.irrAfter,pr.irrAfter,pct,irrALo>=0?"good":"bad")+
    card("총 투자원금",eok(g.investPrincipal))+
    card("무산 매각가치",eok(sa.assetValue),sa.total>=0?"good":"bad");
  // 가치평가 요약
  const lg=landFuture("growth"), lp=landFuture("presale");
  document.getElementById("sumVal").innerHTML=`<div class="kv">`
    +kvr("방식A 지가상승률 (연"+pct(state.growth)+")","토지 "+eok(lg.val)+" + 건물 "+eok(g.bld.val))
    +kvr("방식A 미래 감평",eok(g.marketApp),true)
    +kvr("방식B 분양가역산 (일반 "+state.presale+"억)","토지 "+eok(lp.val)+" + 건물 "+eok(pr.bld.val))
    +kvr("방식B 미래 감평",eok(pr.marketApp),true)
    +kvr("4427 토지평당 (A / B)",Math.round(lg.val/A.property.land_area_pyeong).toLocaleString()+" / "+Math.round(lp.val/A.property.land_area_pyeong).toLocaleString()+"만")
    +kvr("앵커","수진1 92번지 토지평당 3,948만(감평이미지)")+`</div>`;
  // 현금흐름·세금 요약 (활성 방식)
  document.getElementById("sumCF").innerHTML=methodBadge()+`<div class="kv">`
    +kvr("매입가 → 총취득원가",eok(r.totalCost-r.acqTax-r.broker-r.legal)+" → "+eok(r.totalCost))
    +kvr("자기자본 + 적자적립 = 투자원금",eok(r.investPrincipal),true)
    +kvr("연 운영CF (적자→사전적립)",eok(r.opCF))
    +kvr(`협의 청산금(${r.settlementYear}) + 세전 수용재결(${r.litYear})`,eok(r.settlement)+" + "+eok(r.litGross))
    +kvr("= 세전 청산금 (감평+증액)",eok(r.settlement+r.litGross),true)
    +kvr("− 대출·보증금 / 법인세",eok(r.loan+r.deposit)+" / "+eok(r.tax))
    +kvr("세후 순회수(청산) + 세후 수용재결",eok(r.recoverNet)+" + "+eok(r.litNet),true)+`</div>`;
  // 비교표 (세전·세후)
  let h=`<table><thead><tr><th>예측 방식</th><th>미래 감평</th><th>세전 청산금<br><small>감평+증액</small></th><th>세전수익</th><th>세전IRR</th><th>세후수익</th><th>세후IRR</th></tr></thead><tbody>`;
  [["방식A 지가상승률","growth",g],["방식B 분양가역산","presale",pr]].forEach(([l,m,x])=>{
    h+=`<tr class="${state.method===m?'hl':''}"><td>${l}</td><td>${eok(x.marketApp)}</td><td>${eok(x.settlement+x.litGross)}</td><td>${eok(x.preTaxTotal)}</td><td>${pct(x.irrPre)}</td><td>${eok(x.afterTaxTotal)}</td><td>${pct(x.irrAfter)}</td></tr>`;});
  h+=`<tr><td>무산 (매각 평당 ${sa.perPyeong.toLocaleString()}만)</td><td>${eok(sa.assetValue)}</td><td>—</td><td>${eok(sa.net-sa.investPrincipal)}</td><td>—</td><td>${eok(sa.total)}</td><td>—</td></tr></tbody></table>`;
  document.getElementById("scenarioTable").innerHTML=h;
  if(activeTab==="summary"){
    if(scenarioChart)scenarioChart.destroy();
    scenarioChart=new Chart(document.getElementById("scenarioChart"),{type:"bar",
      data:{labels:["방식A","방식B","무산"],datasets:[
        {label:"세전 총수익",data:[g.preTaxTotal,pr.preTaxTotal,sa.net-sa.investPrincipal],backgroundColor:"rgba(127,227,255,.5)"},
        {label:"세후 총수익",data:[g.afterTaxTotal,pr.afterTaxTotal,sa.total],backgroundColor:"rgba(240,210,138,.7)"}]},
      options:opts()});
    if(cashflowChart&&cashflowChart.canvas&&cashflowChart.canvas.id==="cfMiniChart")cashflowChart.destroy();
    let cum=0;const cumD=r.flows.map(f=>cum+=f);
    if(window._cfMini)window._cfMini.destroy();
    window._cfMini=new Chart(document.getElementById("cfMiniChart"),{
      data:{labels:r.flows.map((_,i)=>buy+i),datasets:[
        {type:"bar",label:"연도 현금흐름",data:r.flows,backgroundColor:r.flows.map(f=>f>=0?"#5fe09a":"#ff8a8a")},
        {type:"line",label:"누적",data:cumD,borderColor:"#7fe3ff",tension:.1,pointRadius:0}]},
      options:opts()});
  }
}
const kvr=(l,v,em="")=>`<div class="r ${em?'em':''}"><span class="l">${l}</span><span class="v">${v}</span></div>`;

function renderValuation(){
  const r=full(state.method), p=A.property, fp=A.future_prediction;
  const st=(l,v,big="")=>`<div class="step ${big}"><span class="lbl">${l}</span><span class="v">${v}</span></div>`;
  // ③ 방식A 지가상승률
  const lg=landFuture("growth");
  document.getElementById("growthBox").innerHTML=
    st("토지 2025 (92.45평 × 평당가)", eok(lg.land2025))
    +`<div class="arrow">× (1 + 연율 ${pct(state.growth)})^${state.yearsToApp}년 = ×${lg.mult.toFixed(3)} (총 ${pct(state.totalGrowth)})</div>`
    +st("토지 미래값 (방식A)", eok(lg.val),"big");
  // ③ 방식B 분양가 역산 (추론모델 기반)
  const lp=landFuture("presale");
  document.getElementById("presaleFlow").innerHTML=
    st("일반분양가 (84타입·2032 사시)", state.presale+"억")
    +`<div class="arrow">× ${pct(fp.johap_ratio)} (조합원분양가)</div>`+st("84 조합원분양가", lp.johap.toFixed(2)+"억")
    +`<div class="arrow">× ${pct(fp.appraisal_ratio)} (20평 단독 감정) = ×${fp.combined_factor}</div>`+st("수진2 20평 단독 감정", lp.j20.toFixed(2)+"억")
    +`<div class="arrow">÷ 수진1 20평 ${fp.sujin1_20pyeong_appraisal_eok}억 = 비율 ${lp.ratio.toFixed(3)} (시점·구역 상승, 실제 적용)</div>`
    +`<div class="arrow">× 수진1 대로변 평당 ${fp.sujin1_mainroad_per_pyeong_manwon.toLocaleString()}만 <span style="opacity:.6">(참고: 다가구 ${fp.sujin1_dagagu_per_pyeong_manwon.toLocaleString()}만의 약 ${fp.mainroad_multiple}배)</span></div>`
    +st("4427 토지 평당 감평", Math.round(lp.perPyeong).toLocaleString()+"만/평","big")
    +`<div class="arrow">× 대지 ${p.land_area_pyeong}평</div>`
    +st("토지 미래값 (방식B)", eok(lp.val),"big");
  // 검증 백데이터 (상세)
  const vd=fp.validation||[];
  let vt=`<table><thead><tr><th>구역(사시)</th><th>84 일반</th><th>84 조합</th><th>추정감정<br>(×0.385)</th><th>실측<br>20평단독</th><th>종전<br>평당</th><th>조합원<br>평당</th><th>일반<br>평당</th><th>비례율</th><th>비고</th></tr></thead><tbody>`;
  vd.forEach(x=>{vt+=`<tr><td>${x.구역}</td><td>${x.일반84_억}억</td><td>${x.조합84_억}억</td><td>${x.추정감정_억}억</td><td>${x.실측_억}억</td><td>${x.종전평당_만?x.종전평당_만.toLocaleString()+"만":"—"}</td><td>${x.조합원평당_만.toLocaleString()}만</td><td>${x.일반평당_만.toLocaleString()}만</td><td>${x.비례율}</td><td>${x.비고}</td></tr>`;});
  vt+=`</tbody></table>`;
  const vEl=document.getElementById("presaleValid"); if(vEl)vEl.innerHTML=vt;
  // ④ 시트1 비교사례 (회장님 제공) — 토지평당 / 총액평당 구분
  const cs=A.comparables_sujin1;
  let t=`<table><thead><tr><th>지번</th><th>특징</th><th>대지(평)</th><th>토지감평</th><th>토지평당</th><th>건물(연면적/구조/준공/층)</th><th>건물감평</th><th>감평총액</th><th>총액평당</th></tr></thead><tbody>`;
  (cs?cs.rows:[]).forEach(x=>{t+=`<tr><td>${x.지번}</td><td>${x.특징}</td><td>${x.대지평}</td><td>${x.토지감평_억}억</td><td>${x.토지평당_만원.toLocaleString()}만</td><td>${x.건물연면적평}평·${x.구조}·${x.준공}·${x.층}층</td><td>${x.건물감평_억}억</td><td>${x.감평총액_억}억</td><td>${x.총액평당_만원.toLocaleString()}만</td></tr>`;});
  // 4427 (2025 레벨)
  const land25=p.land_area_pyeong*state.landPerPyeong, b25=building(BASE_YEAR), tot25=land25+b25.val;
  t+=`<tr class="hl"><td>4427</td><td>대로변+8m 코너</td><td>${p.land_area_pyeong}</td><td>${eok(land25)}</td><td>${state.landPerPyeong.toLocaleString()}만</td><td>${p.building_gfa_pyeong}평·RC·${p.build_year}·6층</td><td>${eok(b25.val)}</td><td>${eok(tot25)}</td><td>${Math.round(tot25/p.land_area_pyeong).toLocaleString()}만</td></tr></tbody></table>`;
  document.getElementById("sheet1Table").innerHTML=t;
  document.getElementById("compNote").innerHTML="<b>토지평당</b>=토지감평÷대지평, <b>총액평당</b>=감평총액÷대지평. 4427 토지 앵커는 <b>토지평당</b>(3,700~3,900, 92번지 기준)이며 총액평당과 혼동 주의(예: 88번지 토지 3,760 vs 총액 4,270). 92번지는 실제 감평이미지 확보. 4427 행은 2025 레벨(슬라이더 연동).";
  // ② 건물 원가법 (시점별: 2025·감평연도)
  const b25b=building(BASE_YEAR), bAp=building(r.appraisalYear);
  const ye=document.getElementById("bldgYear"); if(ye)ye.textContent=r.appraisalYear;
  document.getElementById("bldgTable").innerHTML=`<table><thead><tr><th>시점</th><th>경과연수</th><th>잔가율</th><th>재조달원가/평</th><th>건물 감평</th></tr></thead><tbody>`
    +`<tr><td>현재 (2025)</td><td>${b25b.age}년</td><td>${(b25b.residual*100).toFixed(0)}%</td><td>${Math.round(b25b.cost).toLocaleString()}만</td><td>${eok(b25b.val)}</td></tr>`
    +`<tr class="hl"><td>수진2 감평 (${r.appraisalYear})</td><td>${bAp.age}년</td><td>${(bAp.residual*100).toFixed(0)}%</td><td>${Math.round(bAp.cost).toLocaleString()}만</td><td>${eok(bAp.val)}</td></tr>`
    +`</tbody></table>`;
  // ⑤ 산출 종합 — 방식별 (전 케이스)
  const g=full("growth"), pr=full("presale"), land25b=p.land_area_pyeong*state.landPerPyeong;
  let vs=`<table><thead><tr><th>케이스</th><th>토지 미래</th><th>건물</th><th>시세 감평</th><th>청산 기준가(배제 ${pct(state.haircut)})</th></tr></thead><tbody>`;
  vs+=`<tr class="${state.method==="growth"?"hl":""}"><td>방식A 지가상승률 (연${pct(state.growth)})</td><td>${eok(g.lf.val)}</td><td>${eok(g.bld.val)}</td><td>${eok(g.marketApp)}</td><td>${eok(g.appraisalBase)}</td></tr>`;
  vs+=`<tr class="${state.method==="presale"?"hl":""}"><td>방식B 분양가역산 (일반 ${state.presale}억)</td><td>${eok(pr.lf.val)}</td><td>${eok(pr.bld.val)}</td><td>${eok(pr.marketApp)}</td><td>${eok(pr.appraisalBase)}</td></tr>`;
  vs+=`<tr><td>참고: 수진1 기준 (2025, 무성장)</td><td>${eok(land25b)}</td><td>${eok(b25b.val)}</td><td>${eok(land25b+b25b.val)}</td><td>—</td></tr>`;
  vs+=`</tbody></table>`;
  document.getElementById("valSummary").innerHTML=vs;
  // ⑥ 지가 차트
  if(jiga){
    if(jigaChart)jigaChart.destroy();
    const pick=["전국","수정구","수진동"], colors={"전국":"#6b7185","수정구":"#f0d28a","수진동":"#7fe3ff"};
    const idxDs=pick.filter(n=>jiga.series[n]).map(n=>({type:"line",label:n+" 지수",data:jiga.series[n],borderColor:colors[n],spanGaps:true,tension:.2,pointRadius:0,yAxisID:"y"}));
    const rateDs=[];
    if(jiga.rate["수정구"]) rateDs.push({type:"bar",label:"수정구 연변동률(%)",data:jiga.rate["수정구"],backgroundColor:"rgba(240,210,138,.30)",yAxisID:"y1"});
    if(jiga.rate["수진동"]) rateDs.push({type:"bar",label:"수진동 연변동률(%)",data:jiga.rate["수진동"],backgroundColor:"rgba(127,227,255,.30)",yAxisID:"y1"});
    const cv=document.getElementById("jigaChart");
    jigaChart=new Chart(cv,{
      data:{labels:jiga.years,datasets:[...idxDs,...rateDs]},
      options:{responsive:true,animation:false,plugins:{legend:{labels:{color:"#9aa1b4"}}},
        scales:{
          x:{ticks:{color:"#9aa1b4"},grid:{color:"rgba(255,255,255,.09)"}},
          y:{position:"left",ticks:{color:"#9aa1b4"},grid:{color:"rgba(255,255,255,.09)"},title:{display:true,text:"지가지수",color:"#9aa1b4"}},
          y1:{position:"right",ticks:{color:"#e8b15a",callback:v=>v+"%"},grid:{drawOnChartArea:false},title:{display:true,text:"연 변동률(%)",color:"#e8b15a"}}
        }},
      plugins:[dragSelPlugin]});
    wireJigaDrag(cv);
    document.getElementById("jigaNote").textContent="좌축=지가지수(2025.12=100, 선), 우축=연 지가변동률 %(막대). 드래그로 구간 선택 시 누적·CAGR 계산. 수정구 CAGR 2000→25 3.95%·2015→25 4.73%, 수진동 2015→25 5.02%.";
  }
}

function renderCashflow(){
  const r=full(state.method); const row=(l,v,cls="")=>`<tr class="${cls}"><td>${l}</td><td>${v}</td></tr>`;
  const _b25=building(BASE_YEAR), _land25=A.property.land_area_pyeong*state.landPerPyeong;
  const _price=r.totalCost-r.acqTax-r.broker-r.legal, _bldgPortion=_price*_b25.val/(_land25+_b25.val);
  document.getElementById("acqTable").innerHTML=`<table><tbody>`
    +row("매입가",eok(_price))+row(`취득세 등 (${pct(A.acquisition_costs.acquisition_tax_rate)})`,eok(r.acqTax))
    +row("중개+법무",eok(r.broker+r.legal))+row("총 취득원가",eok(r.totalCost),"hl")
    +row("− 대출",eok(r.loan))+row("− 임대보증금",eok(r.deposit))+row("자기자본",eok(r.equity))
    +row("+ 적자 사전적립",eok(r.preFund))+row("총 투자원금",eok(r.investPrincipal),"hl")+`</tbody></table>`
    +`<p class="note"><b>취득세 ${pct(A.acquisition_costs.acquisition_tax_rate)}</b> = 취득세 4.0% + <b>지방교육세 0.4%</b> + 농어촌특별세 0.2% (지방세 이미 포함, 별도 가산 없음). 기존(5년 경과) 법인이라 과밀억제권역 취득세 중과 비대상.<br>`
    +`<b>부가세</b>: 매도자 개인 → 세금계산서 미발행, 부가세 미발생. 매입가 ${eok(_price)} <b>전액 원가</b>(36억×10% 아님). ※ 부가세는 토지 면세, <b>건물 안분분(약 ${eok(_bldgPortion)})에만 10%(약 ${eok(_bldgPortion*0.1)})</b> — 매도자가 사업자이고 환급 불가일 때만 발생.</p>`;
  document.getElementById("opTable").innerHTML=`<table><tbody>`
    +row("연 임대료",eok(r.annualRent))+row("− 이자",eok(r.interest))+row("− 유지보수+보유세",eok(r.maint+r.ptax))
    +row("연 운영CF",eok(r.opCF),r.opCF<0?"hl":"")
    +row("연 감가상각",eok(r.annualDep))+row(`이월결손금(${r.holding}년)`,eok(r.lossCarry))+row("청산시 장부가액",eok(r.bookValue))+`</tbody></table>`;
  document.getElementById("exitTable").innerHTML=methodBadge("청산금 산정에 반영된 예측방식")+`<table><tbody>`
    +row(`협의 청산금 (${r.settlementYear}, = 미래 감평)`,eok(r.settlement),"hl")
    +row(`+ 세전 수용재결 증액 (${r.litYear}, +${pct(state.litUplift)})`,eok(r.litGross))
    +row("= 세전 청산금 (감평+증액)",eok(r.settlement+r.litGross),"hl")
    +row("− 대출상환·보증금반환",eok(r.loan+r.deposit))+row("처분이익",eok(r.dispGain))+row("과세표준(결손공제후)",eok(r.taxBase))+row("법인세",eok(r.tax))
    +row("세후 순회수(청산)",eok(r.recoverNet),"hl")
    +row("세후 수용재결 증액",eok(r.litNet))
    +row("세후 총수익",eok(r.afterTaxTotal),"hl")+row("세후 IRR",pct(r.irrAfter),"hl")+`</tbody></table>`;
  // 민감도: 감평가 ±
  const c=buildCtx(state.method), base=c.appraisalBase;
  let g=`<table><thead><tr><th>감평가</th><th>세전 청산금<br><small>감평+증액</small></th><th>세후수익</th><th>세후IRR</th></tr></thead><tbody>`;
  [-0.2,-0.1,0,0.1,0.2].forEach(d=>{const s=base*(1+d);const o=outcome(c,s,true);
    g+=`<tr class="${d===0?'hl':''}"><td>${d>0?"+":""}${(d*100).toFixed(0)}% (${eok(s)})</td><td>${eok(o.settlement+o.litGross)}</td><td>${eok(o.afterTaxTotal)}</td><td>${pct(o.irrAfter)}</td></tr>`;});
  g+=`</tbody></table>`;
  document.getElementById("gridTable").innerHTML=g;
  if(cashflowChart)cashflowChart.destroy();
  let cum=0;const cumD=r.flows.map(f=>cum+=f);
  cashflowChart=new Chart(document.getElementById("cashflowChart"),{
    data:{labels:r.flows.map((_,i)=>r.buyYear+i),datasets:[
      {type:"bar",label:"연도 현금흐름",data:r.flows,backgroundColor:r.flows.map(f=>f>=0?"#5fe09a":"#ff8a8a")},
      {type:"line",label:"누적",data:cumD,borderColor:"#7fe3ff",tension:.1,pointRadius:0}]},
    options:opts()});
}
function opts(eokAxis=true){return{responsive:true,animation:false,plugins:{legend:{labels:{color:"#9aa1b4"}}},
  scales:{x:{ticks:{color:"#9aa1b4"},grid:{color:"rgba(255,255,255,.09)"}},
          y:{ticks:{color:"#9aa1b4",callback:v=>eokAxis?(v/10000).toFixed(0)+"억":v},grid:{color:"rgba(255,255,255,.09)"}}}};}

// R-ONE 차트 드래그 구간 선택 → 기간·누적·CAGR
function wireJigaDrag(cv){
  const px=e=>{const r=cv.getBoundingClientRect();return e.clientX-r.left;};
  const move=e=>{ if(!jigaDrag)return; jigaDrag.b=px(e); jigaChart.draw(); };
  const up=e=>{ if(!jigaDrag)return; jigaDrag.b=px(e);
    const xs=jigaChart.scales.x, n=jiga.years.length-1, clamp=i=>Math.max(0,Math.min(n,Math.round(i)));
    jigaSel={i0:clamp(xs.getValueForPixel(jigaDrag.a)), i1:clamp(xs.getValueForPixel(jigaDrag.b))};
    jigaChart.draw(); jigaStats();
    window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); };
  cv.onmousedown=e=>{ jigaDrag={a:px(e),b:px(e)}; jigaChart.draw();
    window.addEventListener("mousemove",move); window.addEventListener("mouseup",up); };
}
function jigaStats(){
  const el=document.getElementById("jigaRange"); if(!el||!jigaSel||!jiga)return;
  const a=Math.min(jigaSel.i0,jigaSel.i1), b=Math.max(jigaSel.i0,jigaSel.i1);
  const y0=jiga.years[a], y1=jiga.years[b], yrs=y1-y0;
  const region="수정구", s=jiga.series[region];
  if(yrs<=0||!s||s[a]==null||s[b]==null){ el.innerHTML="기간을 더 넓게 드래그하세요 (수정구 지수 기준)."; return; }
  const cum=s[b]/s[a]-1, cagr=Math.pow(s[b]/s[a],1/yrs)-1;
  // 같은 구간 수진동도 있으면 병기
  let extra="";
  const sd=jiga.series["수진동"];
  if(sd&&sd[a]!=null&&sd[b]!=null){ const cd=Math.pow(sd[b]/sd[a],1/yrs)-1; extra=` / 수진동 CAGR <b>${(cd*100).toFixed(2)}%</b>`; }
  el.innerHTML=`<b>${y0}~${y1}</b> (${yrs}년) — 수정구 누적 <b>${(cum*100).toFixed(1)}%</b> · 연평균 CAGR <b>${(cagr*100).toFixed(2)}%</b>${extra}`;
}

// 레이아웃 변경(가로 접기) 후 차트 크기 재조정 — 그리드 트랜지션(0.3s) 종료 시점
window._chartsResize=()=>{ setTimeout(()=>{
  [scenarioChart,cashflowChart,jigaChart,window._cfMini].forEach(c=>{ try{ c&&c.resize&&c.resize(); }catch(e){} });
}, 340); };

// 파라미터 패널 — 모바일: 바텀시트 오버레이 / 데스크톱: 사이드바 가로 접기
function wireInputsToggle(){
  const main=document.querySelector("main"),
        panel=document.getElementById("inputsPanel"),
        btn=document.getElementById("inputsToggle"),
        fab=document.getElementById("paramFab"),
        backdrop=document.getElementById("inputsBackdrop");
  if(!panel||!btn||!main)return;
  const mq=window.matchMedia("(max-width:820px)");
  const isMobile=()=>mq.matches;
  // 모바일: 바텀시트 오버레이
  const openSheet=()=>{ panel.classList.add("open"); backdrop&&backdrop.classList.add("open");
    document.body.classList.add("sheet-open"); btn.setAttribute("aria-expanded","true"); };
  const closeSheet=()=>{ panel.classList.remove("open"); backdrop&&backdrop.classList.remove("open");
    document.body.classList.remove("sheet-open"); btn.setAttribute("aria-expanded","false"); };
  // 데스크톱: 사이드바를 옆으로(가로) 접기 → 본문 확장
  const setRail=c=>{ main.classList.toggle("params-collapsed",c); btn.setAttribute("aria-expanded",String(!c));
    if(window._chartsResize)window._chartsResize(); };
  // 헤더 클릭: 모바일=시트 닫기 / 데스크톱=가로 접기 토글
  btn.addEventListener("click",()=>{ isMobile()?closeSheet():setRail(!main.classList.contains("params-collapsed")); });
  fab&&fab.addEventListener("click",openSheet);
  backdrop&&backdrop.addEventListener("click",closeSheet);
  document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&isMobile())closeSheet(); });
  // 모드 초기화/전환
  const applyMode=()=>{ closeSheet(); main.classList.remove("params-collapsed"); };
  applyMode();
  mq.addEventListener?mq.addEventListener("change",applyMode):window.addEventListener("resize",applyMode);
}
wireInputsToggle();
init();
