const mongoose=require("mongoose");
mongoose.connect("mongodb+srv://tejakumar:tejakumar145@cluster0.bgum5r9.mongodb.net/paytm");

const userschema=new mongoose.Schema({
  username:String,
  password:String,
  firstname:String,
  lastname:String
})

const accountSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    balance: {
        type: Number,
        required: true
    }
});

const User=mongoose.model("user",userschema);
const Account=mongoose.model("account",accountSchema);
module.exports={
  User,
  Account
};