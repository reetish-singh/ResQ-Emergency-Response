const mongoose=require("mongoose");
const schema=new mongoose.Schema({ actor:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null}, action:{type:String,required:true}, details:{type:mongoose.Schema.Types.Mixed,default:{}}, createdAt:{type:Date,default:Date.now} });
schema.index({createdAt:-1});module.exports=mongoose.model("AuditLog",schema);
