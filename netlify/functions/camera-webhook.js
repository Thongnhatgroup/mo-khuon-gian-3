import { getStore } from '@netlify/blobs';

const STORE_CONFIG = {
  main: 'mining-app-main',
  sessions: 'mining-app-sessions'
};

/**
 * Hàm trích xuất biển số từ XML
 * Camera Hikvision gửi XML với định dạng:
 * <ANPR><licensePlate>ABC123</licensePlate>...</ANPR>
 */
function extractPlateFromXML(xmlStr) {
  try {
    const match = xmlStr.match(/<licensePlate>([^<]+)<\/licensePlate>/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (e) {
    console.error('Error parsing XML for license plate:', e);
  }
  return null;
}

/**
 * Hàm parse multipart/form-data
 * Camera gửi data dạng: boundary + anpr.xml + images
 */
function parseMultipartData(body, contentType) {
  try {
    // Tìm boundary từ Content-Type header
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
      console.error('No boundary found in Content-Type');
      return null;
    }

    const boundary = boundaryMatch[1].trim();
    const parts = body.split(`--${boundary}`);
    
    let extractedData = {
      plate: null,
      imageUrl: null,
      timestamp: Date.now(),
      xmlContent: null
    };

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      // Tìm phần anpr.xml
      if (part.includes('anpr.xml') || part.includes('name="anpr"')) {
        // Tách header và content của phần này
        const headerEndIndex = part.indexOf('\r\n\r\n');
        if (headerEndIndex !== -1) {
          const content = part.substring(headerEndIndex + 4);
          // Loại bỏ trailing CRLF trước boundary
          const xmlContent = content.replace(/\r\n$/, '');
          extractedData.xmlContent = xmlContent;
          
          // Trích xuất biển số từ XML
          const plate = extractPlateFromXML(xmlContent);
          if (plate) {
            extractedData.plate = plate;
          }
        }
      }
      
      // Nếu cần, có thể xử lý ảnh JPEG ở đây
      // (tạm thời bỏ qua vì hàm chỉ cần lưu biển số)
    }

    return extractedData.plate ? extractedData : null;
  } catch (e) {
    console.error('Error parsing multipart data:', e);
    return null;
  }
}

export default async (event, context) => {
  console.log(`[${new Date().toISOString()}] Webhook request received`);
  console.log(`Method: ${event.httpMethod}`);
  console.log(`Headers:`, Object.keys(event.headers));

  if (event.httpMethod !== 'POST') {
    console.warn('Non-POST request rejected');
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const contentType = event.headers['content-type'] || '';
    console.log(`Content-Type: ${contentType}`);

    let plate = null;
    let timestamp = Date.now();
    let imageUrl = null;
    let debugInfo = {};

    // Phát hiện định dạng dữ liệu
    if (contentType.includes('multipart/form-data')) {
      // Định dạng từ camera Hikvision thực tế
      console.log('Parsing multipart/form-data from HikCentral camera');
      const parsed = parseMultipartData(event.body, contentType);
      
      if (parsed) {
        plate = parsed.plate;
        timestamp = parsed.timestamp;
        debugInfo.format = 'multipart/form-data';
        debugInfo.xmlParsed = true;
        console.log(`✓ Parsed from XML: ${plate}`);
      } else {
        console.warn('Failed to extract plate from multipart data');
        debugInfo.format = 'multipart/form-data';
        debugInfo.xmlParsed = false;
        return {
          statusCode: 400,
          body: JSON.stringify({ 
            error: 'Could not extract license plate from XML',
            debug: debugInfo 
          })
        };
      }
    } else if (contentType.includes('application/json')) {
      // Định dạng JSON (hỗ trợ để test)
      console.log('Parsing JSON format');
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      plate = body.plate || null;
      timestamp = body.timestamp || Date.now();
      imageUrl = body.imageUrl || null;
      debugInfo.format = 'json';
      
      if (!plate) {
        console.warn('Plate number missing in JSON body');
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Plate number required' })
        };
      }
    } else {
      // Định dạng không được hỗ trợ
      console.error(`Unsupported Content-Type: ${contentType}`);
      return {
        statusCode: 415,
        body: JSON.stringify({ 
          error: 'Unsupported Media Type',
          expected: 'multipart/form-data or application/json'
        })
      };
    }

    if (!plate) {
      console.error('No plate number found');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Plate number required', debug: debugInfo })
      };
    }

    // Kiểm tra reset lock
    const store = getStore({ name: STORE_CONFIG.main, consistency: 'strong' });
    let resetLock = null;
    try {
      resetLock = await store.get('reset_lock');
    } catch (e) {
      console.error('Error reading reset_lock:', e);
    }
    
    if (resetLock && parseInt(resetLock) > Date.now()) {
      console.log('Reset in progress, returning 409');
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Reset in progress, please retry' })
      };
    }

    // Đọc danh sách events hiện tại
    let events = [];
    try {
      const eventsData = await store.get('events', { type: 'json' });
      events = eventsData ? eventsData : [];
    } catch (e) {
      console.error('Error reading events:', e);
      events = [];
    }

    // Tạo event mới
    const newEvent = {
      id: `camera_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'gate_in',
      plate: plate.toUpperCase().trim(),
      source: 'camera_hikcentral',
      timestamp: timestamp,
      imageUrl: imageUrl || null,
      createdAt: Date.now(),
      format: debugInfo.format
    };

    events.push(newEvent);

    // Lưu events vào Netlify Blobs
    try {
      await store.setJSON('events', events);
      console.log(`✓ Event saved successfully: ${newEvent.plate} (ID: ${newEvent.id})`);
    } catch (e) {
      console.error('Error saving events to store:', e);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to save event',
          message: e.message
        })
      };
    }

    // Cập nhật camera log
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
        imageUrl: imageUrl || null,
        format: debugInfo.format
      });

      // Giữ lại tối đa 1000 bản ghi
      if (cameraLog.length > 1000) {
        cameraLog = cameraLog.slice(-1000);
      }

      await store.setJSON('camera_log', cameraLog);
      console.log(`✓ Camera log updated: ${cameraLog.length} records`);
    } catch (logErr) {
      console.error('Error saving camera log:', logErr);
      // Không return lỗi ở đây, vì log là phụ
    }

    console.log(`[${new Date().toISOString()}] ✓ Webhook processed successfully for ${newEvent.plate}`);
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
