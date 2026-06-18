import { createApp } from './app';

const start = async () => {
  try {
    console.log('Starting application...');
    console.log(`PORT environment variable: ${process.env.PORT}`);
    
    const server = await createApp();
    const port = parseInt(process.env.PORT || '5800', 10);
    const host = '0.0.0.0';
    
    console.log(`Attempting to listen on ${host}:${port}`);
    const address = await server.listen({ port, host });
    console.log(`✅ Server successfully listening at ${address}`);
  } catch (err) {
    console.error('❌ Failed to start server:');
    console.error(err);
    if (err instanceof Error) {
      console.error('Error stack:', err.stack);
    }
    process.exit(1);
  }
};

start(); 
