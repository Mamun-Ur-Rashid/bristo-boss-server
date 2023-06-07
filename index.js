const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const jwt = require('jsonwebtoken');

const cors = require('cors');
const port = process.env.PORT || 5000;
console.log(process.env.PAYMENT_SECRET_KEY);
// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error: true, message:'unauthorized access'})
  }
  // baerer token
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if(err){
      return res.status(401).send({error: true, message: 'unauthorized access'})
    }
    req.decoded = decoded;
    next();
  })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sflyv9x.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {


    const userCollection = client.db("bristodb").collection('users');
    const menuCollection = client.db("bristodb").collection('menu');
    const reViewsCollection = client.db("bristodb").collection('revies');
    const cartCollection = client.db("bristodb").collection('carts');
    const paymentCollection = client.db("bristodb").collection('payments');
    // jwt
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      })
      res.send({token});
    })
    // verify admin secure 
    const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email};
      const user = await userCollection.findOne(query);
      if(user?.role !== 'admin'){
        return res.status(403).send({error: true, message: "forbidden message"});
      }
      next();
    }

    // user collection api
    app.get('/users', verifyJWT,verifyAdmin, async( req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.post('/users', async(req, res) =>{
      const user = req.body;
      // console.log(user);
      const query = {email : user.email};
      const existingUser = await userCollection.findOne(query);
      // console.log("esixting user",existingUser);
      if(existingUser){
        return res.send({message: 'user Already exists'});
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })
    // find admin, security layer: verifyJWT, email same, check admin
    app.get('/users/admin/:email', verifyJWT, async(req, res) => {
      const email = req.params.email;
      if(req.decoded.email !== email){
        return res.send({admin: false});
      }
      const query = { email: email};
      const user = await userCollection.findOne(query);
      const result = {admin: user?.role === 'admin'};
      res.send(result);
    })
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id : new ObjectId(id)};
      const updateDoc = {
        $set : {
          role: 'admin'
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })
// menu related data 
    
    app.get('/menu', async(req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })
    app.post('/menu',verifyJWT, verifyAdmin, async(req, res)=> {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem);
      res.send(result);
    })
    app.delete('/menu/:id', verifyJWT, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })
    app.get('/revies', async(req, res) => {
      const result = await reViewsCollection.find().toArray();
      res.send(result);
    })
    // get carts
    app.get('/carts',verifyJWT, async(req, res) => {
      const email = req.query.email;
      // console.log(email);
      if(!email){
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if(email !== decodedEmail){
        return res.status(403).send({ error: true, message: 'forbidden access'})
      }
      const query = { email: email};
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })
    // cart post
    app.post('/carts', async(req, res) => {
      const item = req.body;
      // console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    })
    // cart delete
    app.delete('/carts/:id', async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })
    // // payment method
    // app.post('/create-payment-intent', async (req, res) => {
    //   const {price} = req.body;
    //   const amount = parseInt(price * 100);
    //   console.log(amount);
    //   const paymentIntent = await stripe.paymentIntents.create({
    //     amount : amount,
    //     currency : 'usd',
    //     payment_method_types: ['card']
    //   });
    //   res.send({
    //     clientSecret : paymentIntent.client_secret
    //   })
    // })
    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      // console.log(price);
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // payment related api
    app.post('/payments',verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {_id: {$in: payment.cartItems.map(id => new ObjectId(id))}};
      const deleteResult = await cartCollection.deleteMany(query);

      res.send({insertResult, deleteResult});
    })
    app.get('/admin-stats',verifyJWT, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      // total price of payment collection
      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0)
      res.send({
        users, products, orders, revenue
      })
    })
    app.get('/order-stats', verifyJWT, verifyAdmin, async(req, res) =>{
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            total: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$total', 2] },
            _id: 0
          }
        }
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray()
      res.send(result)

    })




    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res ) => {
    res.send("Bristo boss server is running!!");

});

app.listen(port, () =>{
    console.log(`Bristo Boss running port on :${port}`);
})