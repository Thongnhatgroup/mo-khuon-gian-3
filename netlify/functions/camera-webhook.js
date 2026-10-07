import { getStore } from '@netlify/blobs';

const STORE_CONFIG = {
  main: 'mining-app-main',
  sessions: 'mining-app-sessions'
};

export default async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { plate, timestamp, imageUrl } = body;

    if (!plate) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Plate number required' })
      };
    }

    const store = getStore({ name: STORE_CONFIG.main, consistency: 'strong' });
    let resetLock = null;
    try {
      resetLock = await store.get('reset_lock');
    } catch (e) {
      console.error('Error reading reset_lock:', e);
    }
    
    if (resetLock && parseInt(resetLock) > Date.now()) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Reset in progress, please retry' })
      };
    }

    let events = [];
    try {
      const eventsData = await store.get('events', { type: 'json' });
      events = eventsData ? eventsData : [];
    } catch (e) {
      console.error('Error reading events:', e);
      events = [];
    }

    const newEvent = {
      id: `camera_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'gate_in',
      plate: plate.toUpperCase().trim(),
      source: 'camera_hikcentral',
      timestamp: timestamp || Date.now(),
      imageUrl: imageUrl || null,
      createdAt: Date.now()
    };

    events.push(newEvent);

    try {
      await store.setJSON('events', events);
      console.log(`Event saved successfully: ${newEvent.plate} (ID: ${newEvent.id})`);
    } catch (e) {
      console.error('Error saving events to store:', e);
    }

    try {
      let cameraLog = [];
      try {
        const cameraLogData = await store.get('camera_log', { type: 'json' });
        cameraLog = cameraLogData ? cameraLogData : [];
      } catch (e) {
        console.error('Error reading camera_log:', e);
        cameraLog = [];
      }
      
      cameraLog.push({
        timestamp: Date.now(),
        plate: newEvent.plate,
        status: 'success',
        imageUrl: imageUrl || null
      });

      if (cameraLog.length > 1000) {
        cameraLog = cameraLog.slice(-1000);
      }

      await store.setJSON('camera_log', cameraLog);
      console.log(`Camera log updated: ${cameraLog.length} records`);
    } catch (logErr) {
      console.error('Error saving camera log:', logErr);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        eventId: newEvent.id,
        plate: newEvent.plate,
        message: 'Vehicle recorded successfully'
      })
    };

  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process webhook',
        message: error.message
      })
    };
  }
};
