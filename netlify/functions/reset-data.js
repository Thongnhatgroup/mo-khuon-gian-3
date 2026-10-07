// Reset data endpoint - tạm thời để xóa dữ liệu xe cũ
import { getStore } from '@netlify/blobs';

const STORE_CONFIG = {
  main: 'mo-khuon-gian-v6'
};

export const handler = async (event, context) => {
  // Kiểm tra xác thực đơn giản (query parameter)
  const resetKey = event.queryStringParameters?.key;
  if (resetKey !== 'reset-vehicle-data-20261007') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const store = getStore({ name: STORE_CONFIG.main, consistency: 'strong' });

    console.log('📋 Đang đọc dữ liệu hiện tại...');
    const events = await store.get('events', { type: 'json' });

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Không có dữ liệu cần reset'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Tìm thấy ${events.length} events`);

    // Xóa tất cả events để reset
    await store.delete('events');
    console.log('✓ Đã xóa events');

    // Xóa camera_log
    await store.delete('camera_log');
    console.log('✓ Đã xóa camera_log');

    return new Response(JSON.stringify({
      success: true,
      message: 'Reset dữ liệu thành công!',
      deletedEvents: events.length,
      note: 'Bây giờ xe có thể được tích xác nhận lại từ đầu.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    return new Response(JSON.stringify({
      error: 'Reset failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
