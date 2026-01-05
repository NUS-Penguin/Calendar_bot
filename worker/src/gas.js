/**
 * Google Apps Script API client
 */

export async function createEvent(env, event) {
  return await callGAS(env, 'create', event);
}

export async function updateEvent(env, eventId, event) {
  return await callGAS(env, 'update', { ...event, eventId });
}

export async function deleteEvent(env, eventId) {
  return await callGAS(env, 'delete', { eventId });
}

async function callGAS(env, action, data) {
  console.log(`Calling GAS API: ${action}`, JSON.stringify(data));
  
  const response = await fetch(env.GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      action, 
      ...data 
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('GAS API error:', error);
    throw new Error(`GAS request failed: ${response.status} ${error}`);
  }
  
  const result = await response.json();
  console.log('GAS response:', JSON.stringify(result));
  
  return result;
}
