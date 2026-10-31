"use strict";
const express=require("express");
const rateLimit=require("express-rate-limit");
const {requireAuth}=require("../middleware/auth");
const {prisma}=require("../prisma");
const {ENGLISH_ACTIVITIES,ENGLISH_CATEGORIES,ENGLISH_LESSONS,getActivity}=require("../learning-content");
const router=express.Router();
router.use(requireAuth);
router.use(rateLimit({windowMs:60000,limit:90,standardHeaders:"draft-7",legacyHeaders:false,keyGenerator:req=>req.userId,message:{error:"Too many learning requests. Please slow down."}}));
const KIND="learning-progress",RECORD_ID="main",DAILY_XP_LIMIT=100;
const XP_REWARDS=Object.freeze({"lesson-completed":5,"study-session-completed":5,"flashcard-reviewed":1,"summary-created":2,"tutor-session-completed":2,"note-created":2});
function levelFromXp(totalXp){return Math.floor(Math.max(0,Math.floor(Number(totalXp)||0))/100)+1;}
function levelInfo(totalXp){const xp=Math.max(0,Math.floor(Number(totalXp)||0)),level=levelFromXp(xp),into=xp%100;return{totalXp:xp,level,title:level<3?"Curious Learner":level<6?"Knowledge Builder":level<10?"Skilled Scholar":level<20?"Learning Champion":"Master Scholar",currentLevelXp:into,nextLevelXp:100,progressPercent:into,xpToNextLevel:100-into};}
function normalizeProgress(data){if(!data||typeof data!=="object"||Array.isArray(data))return{totalXp:0,events:[],dailyDate:"",dailyXp:0,awardKeys:[]};return{totalXp:Number.isSafeInteger(data.totalXp)&&data.totalXp>=0?data.totalXp:0,events:Array.isArray(data.events)?data.events.filter(e=>e&&typeof e.id==="string"&&typeof e.type==="string"&&Number.isInteger(e.xp)&&e.xp>=0&&typeof e.at==="string").slice(-80):[],dailyDate:typeof data.dailyDate==="string"?data.dailyDate:"",dailyXp:Number.isInteger(data.dailyXp)&&data.dailyXp>=0?Math.min(DAILY_XP_LIMIT,data.dailyXp):0,awardKeys:Array.isArray(data.awardKeys)?data.awardKeys.filter(x=>typeof x==="string"&&x.length<=180).slice(-5000):[]};}
function publicProgress(data){const p=normalizeProgress(data),level=levelInfo(p.totalXp),badges=[{id:"first-steps",name:"First Steps",description:"Earn 10 XP",unlocked:p.totalXp>=10},{id:"consistent",name:"Consistent Learner",description:"Earn 50 XP",unlocked:p.totalXp>=50},{id:"builder",name:"Knowledge Builder",description:"Reach Level 2",unlocked:level.level>=2},{id:"dedicated",name:"Dedicated Scholar",description:"Earn 250 XP",unlocked:p.totalXp>=250},{id:"champion",name:"Learning Champion",description:"Reach Level 5",unlocked:level.level>=5},{id:"master",name:"Master Scholar",description:"Reach Level 10",unlocked:level.level>=10}];return{...level,events:p.events.slice(-30).reverse(),badges,unlockedBadges:badges.filter(x=>x.unlocked).length};}
async function readProgress(tx,userId){const r=await tx.userDataRecord.findUnique({where:{userId_kind_recordId:{userId,kind:KIND,recordId:RECORD_ID}},select:{data:true}});return normalizeProgress(r&&r.data);}
async function writeProgress(tx,userId,data){await tx.userDataRecord.upsert({where:{userId_kind_recordId:{userId,kind:KIND,recordId:RECORD_ID}},create:{userId,kind:KIND,recordId:RECORD_ID,data},update:{data,deletedAt:null}});}
async function addXp(tx,userId,event){const p=await readProgress(tx,userId);if(p.awardKeys.includes(event.id))return{awarded:false,duplicate:true,xp:0,progress:publicProgress(p)};const day=new Date().toISOString().slice(0,10),earnedToday=p.dailyDate===day?p.dailyXp:0,xp=Math.max(0,Math.min(event.xp,DAILY_XP_LIMIT-earnedToday)),next={totalXp:p.totalXp+xp,dailyDate:day,dailyXp:earnedToday+xp,awardKeys:[...p.awardKeys,event.id].slice(-5000),events:[...p.events,{...event,xp,at:new Date().toISOString()}].slice(-80)};await writeProgress(tx,userId,next);return{awarded:xp>0,duplicate:false,xp,progress:publicProgress(next)};}
async function lockUser(tx,userId){await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;}
router.get("/progress",async(req,res,next)=>{try{const r=await prisma.userDataRecord.findUnique({where:{userId_kind_recordId:{userId:req.userId,kind:KIND,recordId:RECORD_ID}},select:{data:true}});res.json({progress:publicProgress(r&&r.data)});}catch(e){next(e);}});
router.post("/progress/award",async(req,res,next)=>{
 const action=String(req.body&&req.body.action||""),reference=typeof(req.body&&req.body.reference)==="string"?req.body.reference.trim():"";
 if(!reference||reference.length>120||/[\u0000-\u001f]/.test(reference))return res.status(400).json({error:"A valid learning activity reference is required."});
 try{const result=await prisma.$transaction(async tx=>{await lockUser(tx,req.userId);let xp=XP_REWARDS[action],label=action.replace(/-/g," "),id=action+":"+reference;
 if(action==="quiz-completed"||action==="exam-completed"){const a=await tx.aiQuizAttempt.findFirst({where:{id:reference,userId:req.userId,status:"COMPLETED"},select:{id:true,title:true,difficulty:true,resultData:true}});if(!a)return{error:"Only a completed assessment can earn XP.",status:404};const score=Number(a.resultData&&a.resultData.percentage);if(!Number.isFinite(score))return{error:"Assessment result is invalid.",status:409};if(action==="exam-completed"&&a.difficulty!=="hard")return{error:"Exam XP requires a hard-difficulty assessment.",status:400};xp=5+Math.min(10,Math.floor(Math.max(0,Math.min(100,score))/10));label=a.title||"Assessment completed";id=action+":"+a.id;
 }else if(action==="flashcard-reviewed"){const c=await tx.userDataRecord.findFirst({where:{userId:req.userId,kind:"memory-cards",recordId:reference,deletedAt:null},select:{recordId:true}});if(!c)return{error:"Saved flashcard not found.",status:404};label="Flashcard reviewed";
 }else if(action==="study-session-completed"){const s=await tx.userDataRecord.findFirst({where:{userId:req.userId,kind:"study-sessions",recordId:reference,deletedAt:null},select:{data:true}});if(!s||!s.data||s.data.completed!==true)return{error:"Complete and save the study session first.",status:409};label=s.data.title||"Study session completed";
 }else if(action==="lesson-completed"){const lesson=ENGLISH_LESSONS.find(x=>x.id===reference);if(!lesson)return{error:"English lesson not found.",status:404};label="English lesson: "+lesson.title;
 }else if(action==="summary-created"||action==="note-created"||action==="tutor-session-completed"){const kind=action==="summary-created"?"note-summaries":action==="note-created"?"study-notes":"tutor-conversations";const record=await tx.userDataRecord.findFirst({where:{userId:req.userId,kind,recordId:reference,deletedAt:null},select:{data:true}});if(!record)return{error:"The saved learning record was not found.",status:404};if(action==="tutor-session-completed"&&(!Array.isArray(record.data&&record.data.messages)||record.data.messages.length<2))return{error:"Complete a tutoring exchange before earning XP.",status:409};label=action==="summary-created"?"Notes summary saved":action==="note-created"?"Study note saved":"Tutor lesson completed";
 }else if(!Object.hasOwn(XP_REWARDS,action))return{error:"Unsupported learning activity.",status:400};
 return addXp(tx,req.userId,{id,type:action,xp,label:String(label).slice(0,100),source:reference});},{isolationLevel:"Serializable"});if(result.error)return res.status(result.status).json({error:result.error});res.json(result);}catch(e){next(e);}
});
function buildRecommendations(attempts){
 const groups=new Map();
 for(const attempt of attempts||[]){
  const subject=String(attempt.subject||"General").trim()||"General",topic=String(attempt.topic||"General revision").trim()||"General revision",score=Number(attempt.resultData&&attempt.resultData.percentage);
  if(!Number.isFinite(score))continue;
  const key=(subject+"|"+topic).toLocaleLowerCase();
  if(!groups.has(key))groups.set(key,{subject,topic,scores:[],latest:attempt.completedAt||attempt.createdAt||null});
  const group=groups.get(key);group.scores.push(Math.max(0,Math.min(100,score)));
  const at=attempt.completedAt||attempt.createdAt||null;if(at&&(!group.latest||new Date(at)>new Date(group.latest)))group.latest=at;
 }
 const topics=[...groups.values()].map(g=>({subject:g.subject,topic:g.topic,attempts:g.scores.length,averageScore:Math.round(g.scores.reduce((a,b)=>a+b,0)/g.scores.length),latest:g.latest})).sort((a,b)=>a.averageScore-b.averageScore);
 const needsWork=topics.filter(x=>x.averageScore<70).slice(0,5),strengths=topics.filter(x=>x.averageScore>=80).sort((a,b)=>b.averageScore-a.averageScore).slice(0,5);
 return {basedOnAttempts:(attempts||[]).length,topics,needsWork,strengths,nextActions:needsWork.map(x=>({type:"revise",subject:x.subject,topic:x.topic,reason:"Recent practice average is "+x.averageScore+"%."}))};
}
router.get("/recommendations",async(req,res,next)=>{
 try{
  const attempts=await prisma.aiQuizAttempt.findMany({where:{userId:req.userId,status:"COMPLETED"},orderBy:{completedAt:"desc"},take:100,select:{subject:true,topic:true,resultData:true,createdAt:true,completedAt:true}});
  res.json({recommendations:buildRecommendations(attempts)});
 }catch(error){next(error);}
});
router.get("/english/activities",(req,res)=>{const category=typeof req.query.category==="string"?req.query.category:"all";const activities=ENGLISH_ACTIVITIES.filter(x=>category==="all"||x.category===category).map(({answerIndex,...x})=>x);res.json({categories:ENGLISH_CATEGORIES,activities,lessons:ENGLISH_LESSONS});});
router.post("/english/activities/:activityId/answer",async(req,res,next)=>{const item=getActivity(req.params.activityId),index=req.body&&req.body.optionIndex;if(!item)return res.status(404).json({error:"English activity not found."});if(!Number.isInteger(index)||index<0||index>=item.options.length)return res.status(400).json({error:"Choose an available answer."});try{const correct=index===item.answerIndex;let reward={xp:0};if(correct)reward=await prisma.$transaction(async tx=>{await lockUser(tx,req.userId);return addXp(tx,req.userId,{id:"english-correct:"+item.id,type:"english-correct",xp:3,label:"English: "+item.category.replace(/-/g," "),source:item.id});},{isolationLevel:"Serializable"});res.json({correct,correctIndex:item.answerIndex,explanation:item.explanation,xpAwarded:reward.xp||0,progress:reward.progress||null});}catch(e){next(e);}});
module.exports={router,levelFromXp,levelInfo,publicProgress,addXp,buildRecommendations,ENGLISH_ACTIVITIES,ENGLISH_CATEGORIES,ENGLISH_LESSONS};
