const { ApolloServer, gql } = require('apollo-server');
const dotenv = require('dotenv');
const { MongoClient, ObjectID } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
dotenv.config();
const {DB_URI, DB_NAME, JWT_SECRET } = process.env;


const getToken = (user) => {
    
    const id = user._id.toString();
    return jwt.sign({id: id },JWT_SECRET,{ expiresIn: '30 days' });


}

const getUserFromToken = async (token, db) => {

    if(!token) { return null }
    const tokenData = jwt.verify(token,JWT_SECRET);
    if(!tokenData?.id) {
        return null;
    }
    const id = tokenData.id;
    const user = await db.collection('Users').findOne({_id: ObjectID(id) });
    console.log(user);
    return user;
}

  
const typeDefs = gql`

 type Query {
     myTaskLists: [TaskList!]!
     getTaskList(id: ID!): TaskList
 }




 type Mutation {
     
    signUp(input: SignUpInput): AuthUser!
    signIn(input: SignInInput): AuthUser!

    createTaskList(title: String!): TaskList!
    updateTaskList(id: ID!, title:String!): TaskList!
    deleteTaskList(id: ID!): Boolean
    addUserToTaskList(taskListId: ID!, userId: ID!): TaskList
    
    createTodo(content: String!, taskListId: ID!): ToDo!
    updateToDo(id: ID!, content: String , isCompleted: Boolean): ToDo!
    deleteToDo(id: ID!): Boolean!

 }

 input SignInInput {
     email: String!
     password: String!

 }

 input SignUpInput {

    email: String!
    password: String!
    name:String!
    avatar: String
 }

 type AuthUser {
     user: User!
     token: String!
 }



 type User {
     id: ID!
     name: String!
     email: String!
     avatar: String
 }




 type TaskList {

    id: ID!
    createdAt: String!
    title: String!
    progress: Float!
    
    users: [User!]!
    todos: [ToDo!]
 }



 type ToDo {
     id: ID!
     content: String!
     isCompleted: Boolean!


     taskList: TaskList!
 }


`;
    //Resolvers
    const resolvers = {

        Query: {
            myTaskLists: async( _,__,{ db, user }) =>  {
                
                if(!user) {throw new Error("Authentication Error, Please sign in"); }
                
                return await db.collection('TaskList')
                                        .find({ userIds: user._id})
                                        .toArray();


            },
            getTaskList: async(_,{ id },{ db ,user}) => {

                if(!user) { throw new Error('Authentication Error, Please Sign in'); }

                return await db.collection('TaskList').findOne( { _id: ObjectID(id)} );

            } 
        },
        Mutation: {
            signUp: async(_,data,{ db }) => {
                const input = data.input;
                const hashedPassword = bcrypt.hashSync(input.password);
                const newUser  = {
                    email: input.email,
                    password: hashedPassword,
                    name: input.name
                }
    
                // save to database
                const result = await db.collection('Users').insert(newUser);
                console.log(result);
                const user = {
                    ...newUser,
                    id: result.insertedIds[0].toString()
                };
                console.log(user);
                return {
                    user,
                    token: getToken(user),
                }
                
    
    
    
            },
    
            signIn: async(_,data,{ db }) => {
                const input = data.input;
                const user = await db.collection('Users').findOne({ email: input.email });
                const isPasswordCorrect = bcrypt.compareSync(input.password,user.password || '');
                if(!user || !isPasswordCorrect) {
                    throw new Error('Invalid credentials');
                }
                return {
                    user,
                    token: getToken(user),
                }


    
            },



            createTaskList: async(_,data,{ db, user }) => {

                console.log(data.title);
                if(!user) {
                    throw new Error('Authentication Error Please Sign In');
                }

                const newTaskList = {
                    title: data.title,
                    createdAt: new Date().toISOString(),
                    userIds: [user._id]

                }

                const result = await db.collection('TaskList').insert(newTaskList);
                console.log(result);
                const res = {
                    id: result.insertedIds[0].toString(),
                    ...newTaskList
                }
                return res;


            },

            updateTaskList: async(_,{ id, title }, { db, user }) => {

                if(!user) { return new Error('Authentication Error, Please Sign in'); }
                console.log(id);
                const  result = await db.collection('TaskList')
                                          .updateOne({

                                            _id: ObjectID(id)

                                          },{
                                              $set: {
                                                  title
                                              }
                                          })
                
                const res = await db.collection('TaskList').findOne({ _id: ObjectID(id) });
                return res;


            },

            deleteTaskList: async(_,{ id },{ db ,user}) => {
                if(!user) { throw new Error('Authentication Error, Please Sign in'); }

                //TODO only collaborators should be able to delete
                await db.collection('TaskList').remove(
                                                { _id: ObjectID(id) },
                                                {
                                                    justOne: true
                                                });
                return true;

            },
            addUserToTaskList: async(_,{ taskListId, userId }, { db, user }) => {

                if(!user) { return new Error('Authentication Error, Please Sign in'); }
                const taskList = await db.collection('TaskList').findOne({ _id: ObjectID(taskListId)});
                if(!taskList) { return null }
                if(taskList.userIds.find((dbId) => dbId.toString() === userId.toString())) {
                    return taskList;
                }
                await db.collection('TaskList')
                                    .updateOne({
                                        _id: ObjectID(taskListId)

                                    },{
                                        $push: {
                                            userIds: ObjectID(userId),
                                        }
                                    })
                
                taskList.userIds.push(ObjectID(userId))
                return taskList;


            },


            //Todo Items
            createTodo: async(_,{ content, taskListId },{ db, user}) => {
                if(!user) { return new Error('Authentication Error, Please Sign in'); }

                const todo = {
                    content: content,
                    taskListId: taskListId,
                    isCompleted: false
                }

                const result = await db.collection('ToDo').insert(todo);
                const res = {
                    id: result.insertedIds[0].toString(),
                    ...todo
                }
                return res;



            },
            updateToDo: async(_,data, { db, user }) => {

                if(!user) { return new Error('Authentication Error, Please Sign in'); }
                console.log(data.id);
                const  result = await db.collection('ToDo')
                                          .updateOne({

                                            _id: ObjectID(data.id)

                                          },{
                                              $set: data
                                          })
                
                const res = await db.collection('ToDo').findOne({ _id: ObjectID(data.id) });
                return res;


            },
            deleteToDo: async(_,{ id },{ db ,user}) => {
                if(!user) { throw new Error('Authentication Error, Please Sign in'); }

                //TODO only collaborators should be able to delete
                await db.collection('ToDo').remove(
                                                { _id: ObjectID(id) },
                                                {
                                                    justOne: true
                                                });
                return true;

            },



        },

        User: {

            id: ({ _id, id }) => _id || id

        },

        TaskList: {

            id: ({ _id, id }) => _id || id,
            progress: async({_id}, _,{ db }) => {
                const todos = await db.collection('ToDo').find({ taskListId: _id.toString()}).toArray()
                const completed = todos.filter(todo => todo.isCompleted);
                if(todos.length === 0) {
                    return 0;
                }
                return (completed.length / todos.length)*100;

            } ,
            users: async({ userIds }, _,{ db }) => Promise.all(
                userIds.map((userId) => (
                    db.collection('Users').findOne({_id: userId}))
                )
            ),
            todos: async({_id}, _,{ db }) => (

                await db.collection('ToDo').find({ taskListId: _id.toString()}).toArray()
                  

            )
        },

        ToDo: {
            id: ({ _id, id },_,{ db }) => _id || id,
            taskList: async({ taskListId },_,{ db }) => await db.collection('TaskList').findOne({ _id: ObjectID(taskListId) })
        }
    
};





const start = async() => {

    const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    const db = client.db(DB_NAME);



    if(client) {
        console.log("Connection with DB established")
    }

    // The ApolloServer constructor requires two parameters: your schema
    // definition and your set of resolvers.
    const server = new ApolloServer({ 
        typeDefs, 
        resolvers, 
        context: async({ req }) => {

            const user = await getUserFromToken(req.headers.authorization, db);
            return {
                db,
                user
            }
        }, 
    });

    // The `listen` method launches a web server.
    server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
    });

}

start();


