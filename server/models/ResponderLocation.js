const mongoose = require("mongoose");
const schema = new mongoose.Schema({ responder: {type: mongoose.Schema.Types.ObjectId, ref:"User", required:true, unique:true}, latitude:{type:Number,required:true,min:-90,max:90}, longitude:{type:Number,required:true,min:-180,max:180}, updatedAt:{type:Date,default:Date.now} });
module.exports=mongoose.model("ResponderLocation",schema);
