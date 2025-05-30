const dotenv = require('dotenv');
dotenv.config();

function checkEnvVariables() {
  const requiredVars = [
    'FRONTEND_URL',
    'MONGODB_URI',
    'JWT_SECRET',
    'PORT'
  ];

  const missingVars = [];
  const configuredVars = [];

  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    } else {
      // Mask sensitive values
      const value = varName.includes('SECRET') || varName.includes('URI') 
        ? '[MASKED]' 
        : process.env[varName];
      configuredVars.push(`${varName}=${value}`);
    }
  });

  console.log('\n=== Environment Variables Check ===\n');
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(v => console.error(`   - ${v}`));
  } else {
    console.log('✅ All required environment variables are set!\n');
  }

  console.log('Configured variables:');
  configuredVars.forEach(v => console.log(`   ${v}`));

  // CORS specific checks
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    try {
      const url = new URL(frontendUrl);
      console.log('\nFRONTEND_URL analysis:');
      console.log(`   Protocol: ${url.protocol}`);
      console.log(`   Host: ${url.host}`);
      console.log(`   Origin: ${url.origin}`);
      
      if (url.protocol !== 'https:' && !url.hostname.includes('localhost')) {
        console.warn('\n⚠️  Warning: FRONTEND_URL should use HTTPS in production!');
      }
    } catch (error) {
      console.error('\n❌ Error: FRONTEND_URL is not a valid URL!');
    }
  }

  return missingVars.length === 0;
}

if (require.main === module) {
  const isValid = checkEnvVariables();
  if (!isValid) {
    console.error('\n❌ Please set all required environment variables before starting the server.');
    process.exit(1);
  }
}

module.exports = checkEnvVariables; 