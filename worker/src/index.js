/**
 * C4lendar Bot - Cloudflare Worker
 * Main entry point for Telegram webhook and API endpoints
 */

import { handleTelegramUpdate } from './telegram.js';
import { parseEventText } from './groq.js';
import { generateOAuthUrl, handleOAuthCallback } from './oauth.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // OAuth start endpoint
    if (url.pathname === '/oauth/start' && request.method === 'GET') {
      const chatId = url.searchParams.get('chatId');
      const userId = url.searchParams.get('userId');
      const chatType = url.searchParams.get('chatType') || 'private';
      
      if (!chatId || !userId) {
        return new Response(JSON.stringify({ 
          error: 'Missing chatId or userId parameter' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      try {
        const authUrl = await generateOAuthUrl(chatId, userId, chatType, env);
        
        // Redirect user to Google OAuth consent screen
        return Response.redirect(authUrl, 302);
      } catch (error) {
        console.error('OAuth start error:', error);
        return new Response(JSON.stringify({ 
          error: 'Failed to generate OAuth URL',
          message: error.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // OAuth callback endpoint
    if (url.pathname === '/oauth/callback' && request.method === 'GET') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      
      if (error) {
        return new Response(`
          <html>
            <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
              <h1 style="color: #d32f2f;">❌ Authorization Failed</h1>
              <p>You denied access or an error occurred: <strong>${error}</strong></p>
              <p>Please try again by using the <code>#aut</code> command in the bot.</p>
            </body>
          </html>
        `, {
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      if (!code || !state) {
        return new Response(`
          <html>
            <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
              <h1 style="color: #d32f2f;">❌ Invalid Request</h1>
              <p>Missing authorization code or state parameter.</p>
            </body>
          </html>
        `, {
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      try {
        const result = await handleOAuthCallback(code, state, env);
        
        return new Response(`
          <html>
            <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
              <h1 style="color: #4caf50;">✅ Success!</h1>
              <p>Your Google Calendar has been linked successfully to this chat.</p>
              <p>Account: <strong>${result.email}</strong></p>
              <p>You can now close this window and return to Telegram.</p>
              <p style="margin-top: 30px; color: #666;">Try creating an event with <code>#cal</code>!</p>
            </body>
          </html>
        `, {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        });
      } catch (error) {
        console.error('OAuth callback error:', error);
        return new Response(`
          <html>
            <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
              <h1 style="color: #d32f2f;">❌ Authorization Failed</h1>
              <p>Error: <strong>${error.message}</strong></p>
              <p>Please try again by using the <code>#aut</code> command in the bot.</p>
            </body>
          </html>
        `, {
          status: 500,
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
    
    // Telegram webhook endpoint
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        
        // Process webhook asynchronously (don't block response)
        ctx.waitUntil(handleTelegramUpdate(update, env));
        
        // Immediately acknowledge to Telegram
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Webhook error:', error);
        return new Response('Error', { status: 500 });
      }
    }
    
    // Debug parse endpoint for testing
    if (url.pathname === '/parse' && request.method === 'POST') {
      try {
        const { text, nowIso, tz } = await request.json();
        const result = await parseEventText(text, env, nowIso, tz);
        
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          error: error.message,
          stack: error.stack 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Health check endpoint
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'C4lendar Bot Worker',
        version: '1.0.0',
        endpoints: [
          'POST /telegram-webhook',
          'POST /parse (debug)'
        ]
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};
