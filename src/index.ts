// import './utilis/corn'
import { FastifyInstance } from 'fastify';
import awsLambdaFastify from '@fastify/aws-lambda';
import { createApp } from './app';

let fastifyApp: FastifyInstance;
let proxy: any;

// Lambda handler
export const handler = async (event: any, context: any) => {
  // Initialize the app only once per Lambda container
  if (!fastifyApp) {
    fastifyApp = await createApp();
    proxy = awsLambdaFastify(fastifyApp);
  }

  // Handle the request
  const response = await proxy(event, context);
  return response;
}; 