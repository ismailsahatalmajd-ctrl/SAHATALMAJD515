const net = require('net');

console.log('جاري محاولة الاتصال بجهاز ZKTeco MB20-VL...');
console.log('IP: 192.168.8.200');
console.log('Port: 4370\n');

const client = new net.Socket();
client.setTimeout(5000); // 5 ثواني مهلة

client.connect(4370, '192.168.8.200', function() {
    console.log('✅ ممتاز! تم الاتصال بنجاح بجهاز البصمة على منفذ 4370.');
    console.log('الكمبيوتر الآن متصل بجهاز البصمة ويمكننا البدء في سحب البيانات.');
    client.destroy(); // إغلاق الاتصال بعد نجاح الفحص
});

client.on('error', function(err) {
    console.log('❌ فشل الاتصال بالجهاز!');
    console.log('السبب المرجح: ', err.message);
    console.log('\nالرجاء التأكد مما يلي:');
    console.log('1. أن الكيبل موصول جيداً بجهاز البصمة والراوتر.');
    console.log('2. أن الكمبيوتر متصل بنفس الراوتر أو الشبكة.');
    client.destroy();
});

client.on('timeout', function() {
    console.log('⏱ انقضى وقت الاتصال (Timeout) دون استجابة.');
    console.log('تحقق من ألا يكون هناك جدار حماية (Firewall) يمنع الاتصال، وأن الجهاز قيد التشغيل وموصول بالشبكة.');
    client.destroy();
});
