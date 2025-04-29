const { Kafka } = require('kafkajs');

// Configuración con variables de entorno para flexibilidad
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'my-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'wikimedia-topic';
const CLIENT_ID = process.env.CLIENT_ID || 'wikimedia-consumer';
const CONSUMER_GROUP = process.env.CONSUMER_GROUP || 'wikimedia-consumer-group';

// Configuración de procesamiento
const PROCESSING_TIME_MS = process.env.PROCESSING_TIME_MS || 500; // Tiempo simulado de procesamiento

const kafka = new Kafka({
  clientId: CLIENT_ID,
  brokers: KAFKA_BROKERS.split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const consumer = kafka.consumer({ 
  groupId: CONSUMER_GROUP,
  // Importante para KEDA: permite escalar a cero
  allowAutoTopicCreation: true
});

// Función simulada de procesamiento de mensajes
const processMessage = async (message) => {
  try {
    const data = JSON.parse(message.value.toString());
    console.log(`[${new Date().toISOString()}] Procesando cambio: ${data.title || 'sin título'} (${data.type || 'desconocido'})`);
    
    // Simulamos procesamiento que toma tiempo
    await new Promise(resolve => setTimeout(resolve, PROCESSING_TIME_MS));
    
    console.log(`[${new Date().toISOString()}] Procesado: ${data.id}`);
    return true;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error procesando mensaje:`, err);
    return false;
  }
};

const run = async () => {
  try {
    // Identificar el pod para mejor visualización de logs
    const podName = process.env.HOSTNAME || 'local';
    console.log(`[${new Date().toISOString()}] Consumidor iniciado en pod: ${podName}`);
    
    console.log(`[${new Date().toISOString()}] Conectando con Kafka: ${KAFKA_BROKERS}`);
    await consumer.connect();
    console.log(`[${new Date().toISOString()}] Suscribiéndose al topic: ${KAFKA_TOPIC}`);
    await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

    let processedCount = 0;
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const success = await processMessage(message);
        if (success) {
          processedCount++;
          if (processedCount % 5 === 0) {
            console.log(`[${new Date().toISOString()}] Pod ${podName} ha procesado ${processedCount} mensajes`);
          }
        }
      },
    });

    // Manejador para señales de terminación
    const handleTermination = async () => {
      console.log(`[${new Date().toISOString()}] Recibida señal de terminación, cerrando conexiones...`);
      await consumer.disconnect();
      console.log(`[${new Date().toISOString()}] Terminado correctamente.`);
      process.exit(0);
    };

    process.on('SIGTERM', handleTermination);
    process.on('SIGINT', handleTermination);

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error crítico:`, err);
    process.exit(1);
  }
};

run();