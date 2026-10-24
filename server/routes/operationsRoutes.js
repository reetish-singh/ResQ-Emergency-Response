const express=require("express");
const auth=require("../middleware/authMiddleware");
const requireRole=require("../middleware/roleMiddleware");
const Location=require("../models/ResponderLocation");
const Audit=require("../models/AuditLog");
const Notification=require("../models/Notification");
const router=express.Router();router.use(auth);
router.post("/location",requireRole("responder"),async(req,res)=>{
 try{const latitude=Number(req.body.latitude),longitude=Number(req.body.longitude);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return res.status(400).json({message:"Invalid GPS coordinates"});
 const location=await Location.findOneAndUpdate({responder:req.user.userId},{latitude,longitude,updatedAt:new Date()},{upsert:true,new:true,runValidators:true});
 req.app.get("io")?.to("role:admin").emit("responder:location",{responder:req.user.userId,latitude,longitude,updatedAt:location.updatedAt});
 res.json({location});}catch(error){res.status(500).json({message:"Location update failed"});}
});
router.get("/locations",requireRole("admin"),async(_req,res)=>{
 try{const locations=await Location.find({updatedAt:{$gte:new Date(Date.now()-15*60*1000)}}).populate("responder","name email").lean();res.json({locations});}catch(error){res.status(500).json({message:"Location lookup failed"});}
});
router.get("/audit",requireRole("admin"),async(_req,res)=>{
 try{const logs=await Audit.find().populate("actor","name email").sort({createdAt:-1}).limit(100).lean();res.json({logs});}catch(error){res.status(500).json({message:"Audit lookup failed"});}
});
router.get("/analytics",requireRole("admin"),async(_req,res)=>{
 try{const alerts=await Notification.find({broadcastId:{$ne:null}}).lean();const acknowledged=alerts.filter(x=>x.acknowledgedAt);const avgMs=acknowledged.length?Math.round(acknowledged.reduce((a,x)=>a+(new Date(x.acknowledgedAt)-new Date(x.createdAt)),0)/acknowledged.length):null;
 res.json({total:alerts.length,acknowledged:acknowledged.length,pending:alerts.length-acknowledged.length,averageAcknowledgmentSeconds:avgMs===null?null:Math.round(avgMs/1000)});
 }catch(error){res.status(500).json({message:"Analytics unavailable"});}
});
module.exports=router;
