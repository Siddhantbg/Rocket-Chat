const io = require('socket.io-client');
const dotenv = require('dotenv');

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_USER_ID = 'test-user-123';
const TEST_ROOM_ID = 'test-room-456';

async function testRateLimiting() {
  console.log('🚀 Starting rate limit test...');
  
  const socket = io(BACKEND_URL);
  let messageCount = 0;
  let blockedCount = 0;

  // Connect and setup socket handlers
  socket.on('connect', async () => {
    console.log('Connected to server');
    
    // Handle successful message sends
    socket.on('message:sent', (response) => {
      if (response.success) {
        messageCount++;
        console.log(`✅ Message ${messageCount} sent successfully`);
      } else if (response.error === 'Rate limit exceeded') {
        blockedCount++;
        console.log(`❌ Message blocked: ${response.error}`);
      }
    });

    // Handle rate limit events
    socket.on('rate:limit', (data) => {
      console.log(`⚠️ Rate limit hit: ${data.error}`);
      console.log(`⏰ Reset time: ${new Date(data.reset).toLocaleTimeString()}`);
      console.log(`📊 Remaining: ${data.remaining}`);
    });

    // Simulate user connection
    socket.emit('user:connect', TEST_USER_ID);

    // Join test room
    socket.emit('room:join', TEST_ROOM_ID);

    // Wait for room join
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send burst of 5 messages
    console.log('\n📨 Sending burst of 5 messages...');
    for (let i = 1; i <= 5; i++) {
      socket.emit('message:send', {
        senderId: TEST_USER_ID,
        roomId: TEST_ROOM_ID,
        type: 'text',
        content: `Test message ${i}`,
        clientId: `msg-${i}`
      });
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between messages
    }

    // Wait for 10 seconds and try sending another message
    console.log('\n⏳ Waiting 10 seconds for rate limit window to reset...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\n📨 Sending one more message after reset...');
    socket.emit('message:send', {
      senderId: TEST_USER_ID,
      roomId: TEST_ROOM_ID,
      type: 'text',
      content: 'Test message after reset',
      clientId: 'msg-after-reset'
    });

    // Wait for final message processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Print test results
    console.log('\n📊 Test Results:');
    console.log(`Messages sent successfully: ${messageCount}`);
    console.log(`Messages blocked: ${blockedCount}`);

    // Cleanup
    socket.disconnect();
    process.exit(0);
  });
}

// Run the test
testRateLimiting().catch(console.error); 