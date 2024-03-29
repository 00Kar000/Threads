"use server";

import { revalidatePath } from "next/cache";
import Thread from "../models/thread.modal";
import User from "../models/user.model";
import { connectToDb } from "../mongoose";

interface Params {
  text: string;
  author: string;
  communityId: string | null;
  path: string;
}

export async function createThread({
  text,
  author,
  communityId,
  path,
}: Params) {
  try {
    connectToDb();
    const createdThread = await Thread.create({
      text,
      author,
      community: null,
    });

    // Update user model
    await User.findByIdAndUpdate(author, {
      $push: { threads: createdThread._id },
    });

    revalidatePath(path);
  } catch (error: any) {
    console.log(error)
  }
}

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  connectToDb();

  //  Calculate the number of posts to skip

  const skipAmount = (pageNumber - 1) * pageSize;

  //  Fetch the posts tha have no parents (top0level threads)
  const postsQuery = Thread.find({ parentId: { $in: [null, undefined] } })
    .sort({ createdAt: "desc" })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({ path: "author", model: User })
    .populate({
      path: "children",
      populate: {
        path: "author",
        model: User,
      },
    });
  const totalPostsCount = await Thread.countDocuments({
    parentId: { $in: [null, undefined] },
  });

  const posts = await postsQuery.exec();

  const isNext = totalPostsCount > skipAmount + posts.length;

  return { posts, isNext };
}

export async function fetchThreadById(id: string) {
  connectToDb();

  try {
    //  TODO: Populate Community
    const thread = await Thread.findById(id)
      .populate({
        path: "author",
        model: User,
        select: "_id id name image",
      })
      .populate({
        path: "children",
        populate: [
          {
            path: "author",
            model: User,
            select: "_id id name parentId image",
          },{
            path:'children',
            model:Thread,
            populate:{
              path: "author",
              model: User,
              select: "_id id name parentId image",
            }
          }
        ],
      }).exec();
      
      return thread
  } catch (error:any) {
    throw new Error(`Error fetching thread: ${error.message}`)
  }
}

export async function addCommentToThread(
  threadId:string,
  commentText:string,
  userId:string,
  path:string,
  ) {
    connectToDb();

    try {
        //  Find the original thread by its ID

        const originalThread  = await Thread.findById(threadId)

        if(!originalThread){
          throw new Error("Thread not found")
        }

        //  Create a new thread with the comment text

        const commentThread = new Thread({
          text:commentText,
          author:userId,
          parentId:threadId,
        })


        // Save the new thraed
        const savedCommentThread = await commentThread.save();

        // Update
        // originalThread.updateOne(
        //   {$push: {children:savedCommentThread._id}}
        // )

        await originalThread.children.push(savedCommentThread._id);


        // Save original thread
        await originalThread.save()


       revalidatePath(path);
    } 
    catch (error:any) {
     console.log("Comment error " + error)
    }
}