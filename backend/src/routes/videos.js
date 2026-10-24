const express=require("express");
const rateLimit=require("express-rate-limit");
const {requireAuth}=require("../middleware/auth");
const router=express.Router();
router.use(requireAuth);
const limiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:"draft-7",legacyHeaders:false,keyGenerator:req=>req.userId,message:{error:"Too many video searches. Please wait a few minutes before searching again."}});
router.get("/search",limiter,async(req,res)=>{
 const query=typeof req.query.q==="string"?req.query.q.trim().slice(0,100):"";
 if(query.length<2)return res.status(400).json({error:"Enter at least two characters to search for a lesson."});
 if(!process.env.YOUTUBE_API_KEY)return res.status(503).json({error:"Educational video search is not configured yet. Add YOUTUBE_API_KEY to the backend host environment and redeploy."});
 const params=new URLSearchParams({part:"snippet",type:"video",videoCategoryId:"27",videoEmbeddable:"true",safeSearch:"strict",maxResults:"12",order:"relevance",q:query,key:process.env.YOUTUBE_API_KEY});
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch("https://www.googleapis.com/youtube/v3/search?"+params.toString(),{signal:controller.signal,headers:{Accept:"application/json"}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){console.error("YouTube video search failed:",response.status,data?.error?.status||"provider error");if(response.status===403)return res.status(503).json({error:"The video provider quota or API access is unavailable. Ask the administrator to check the YouTube Data API configuration."});return res.status(502).json({error:"The educational video provider could not complete the search. Please try again later."});}
  const items=(Array.isArray(data.items)?data.items:[]).filter(item=>item?.id?.videoId&&item?.snippet?.title&&item?.snippet?.channelTitle).map(item=>({id:item.id.videoId,title:String(item.snippet.title).slice(0,300),channelTitle:String(item.snippet.channelTitle).slice(0,160),description:String(item.snippet.description||"").slice(0,600),thumbnail:item.snippet.thumbnails?.medium?.url||item.snippet.thumbnails?.high?.url||item.snippet.thumbnails?.default?.url||""})).filter(item=>/^[-_a-zA-Z0-9]{11}$/.test(item.id)&&/^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(item.thumbnail));
  res.set("Cache-Control","private, max-age=300");res.json({items,count:items.length,source:"YouTube Education category",safeSearch:"strict"});
 }catch(error){if(error.name==="AbortError")return res.status(504).json({error:"Video search took too long. Please try again."});console.error("YouTube video search error:",error.message);res.status(502).json({error:"Could not reach the educational video provider."});}finally{clearTimeout(timeout);}
});
module.exports=router;