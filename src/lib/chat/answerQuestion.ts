import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/embeddings/generateEmbeddings";
import { findSimilarChunks } from "@/lib/retrieval/vectorSearch";
import { generateAnswer } from "@/lib/rag/generateAnswer";

export interface AnswerQuestionInput {
  question: string;
  conversationId?: string;
}

/**
 * The full question-answering pipeline, orchestrating the modules that
 * do the actual work:
 *   validate (done by caller) -> embed question -> vector search
 *   -> retrieve chunks -> generate grounded answer -> persist messages
 *
 * Returns the conversation id (creating one on first message) plus the
 * answer and its sources, ready for the API route to return as JSON.
 */
export async function answerQuestion(input: AnswerQuestionInput) {
  const conversation = input.conversationId
    ? await prisma.conversation.findUniqueOrThrow({ where: { id: input.conversationId } })
    : await prisma.conversation.create({
        data: { title: input.question.slice(0, 80) },
      });

  await prisma.message.create({
    data: { conversationId: conversation.id, role: "USER", content: input.question },
  });

  const queryEmbedding = await generateEmbedding(input.question);
  const chunks = await findSimilarChunks(queryEmbedding);
  const result = await generateAnswer(input.question, chunks);

  const assistantMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: result.answer,
      sources: result.sources as unknown as object[],
    },
  });

  return {
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    answer: result.answer,
    sources: result.sources,
    isGrounded: result.isGrounded,
  };
}
