const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { User, Account } = require("./db");
const jwt = require("jsonwebtoken");
const zod = require("zod");
const bcrypt = require("bcrypt");

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Replace this with your actual JWT secret key
const JWT_SECRET = "your_jwt_secret_key";

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ msg: "Authorization header missing or invalid" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (err) {
        return res.status(403).json({ msg: "Invalid or expired token" });
    }
};

const signupBodySchema = zod.object({
  username: zod.string().min(5).email(),
  password: zod.string().min(5),
  firstname: zod.string().min(5),
  lastname: zod.string().min(5),
});

app.post("/signup", async (req, res) => {
  const result = signupBodySchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      msg: "Invalid input",
      errors: result.error.errors,
    });
  }

  const existingUser = await User.findOne({ username: req.body.username });
  if (existingUser) {
    return res.status(409).json({
      msg: "User already exists",
    });
  }

  const hashedPassword = await bcrypt.hash(req.body.password, 10);

  const newUser = await User.create({
    username: req.body.username,
    password: hashedPassword,
    firstname: req.body.firstname,
    lastname: req.body.lastname,
  });

  await Account.create({
    userId: newUser._id,
    balance: 1 + Math.random() * 10000
  });

  const token = jwt.sign({ id: newUser._id, username: newUser.username }, JWT_SECRET);

  res.status(201).json({
    msg: "User created successfully",
    token: token
  });
});

const signinBodySchema = zod.object({
  username: zod.string().min(5).email(),
  password: zod.string().min(5)
});

app.post("/signin", async (req, res) => {
  const result = signinBodySchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      msg: "Invalid inputs",
      errors: result.error.errors
    });
  }

  const user = await User.findOne({ username: req.body.username });
  if (!user) {
    return res.status(401).json({
      msg: "Invalid username or password"
    });
  }

  const isPasswordValid = await bcrypt.compare(req.body.password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      msg: "Invalid username or password"
    });
  }

  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);

  res.json({
    msg: "Login successful",
    token: token
  });
});

const updateBody = zod.object({
  password: zod.string().optional(),
  firstname: zod.string().optional(),
  lastname: zod.string().optional(),
});

app.put("/update", authMiddleware, async (req, res) => {
  const result = updateBody.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      msg: "Invalid inputs",
      errors: result.error.errors
    });
  }

  try {
    const updates = result.data;
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    await User.updateOne({ _id: req.userId }, updates);

    res.json({
      msg: "Updated successfully"
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({
      msg: "An error occurred while updating",
      error: error.message
    });
  }
});

app.get("/bulk", async (req, res) => {
  const filter = req.query.filter || "";

  const users = await User.find({
    $or: [{
      firstname: {
        "$regex": filter,
        "$options": "i"
      }
    }, {
      lastname: {
        "$regex": filter,
        "$options": "i"
      }
    }]
  });

  res.json({
    users: users.map(user => ({
      username: user.username,
      firstname: user.firstname,
      lastname: user.lastname,
      _id: user._id
    }))
  });
});

app.get("/balance", authMiddleware, async (req, res) => {
  const account = await Account.findOne({
    userId: req.userId
  });

  if (!account) {
    return res.status(404).json({
      msg: "Account not found"
    });
  }

  res.json({
    balance: account.balance
  });
});

app.post("/transfer", authMiddleware, async (req, res) => {
    const session = await mongoose.startSession();

    session.startTransaction();
    const { amount, to } = req.body;
  
    const account = await Account.findOne({ userId: req.userId 
    }).session(session);

    if (!account || account.balance < amount) {
        await session.abortTransaction();
        return res.status(400).json({
            message: "Insufficient balance"
        });
    }

    const toAccount = await Account.findOne({ userId: to 
    }).session(session);

    if (!toAccount) {
        await session.abortTransaction();
        return res.status(400).json({
            message: "Invalid account"
        });
    }

    await Account.updateOne({ userId: req.userId }, { $inc: { 
    balance: -amount } }).session(session);
    await Account.updateOne({ userId: to }, { $inc: { balance: amount 
    } }).session(session);

    await session.commitTransaction();

    res.json({
        message: "Transfer successful"
    });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
