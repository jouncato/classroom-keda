const EventSource = require('eventsource');
const { Kafka } = require('kafkajs');

// Configuración con variables de entorno para flexibilidad
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'my-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'wikimedia-topic';
const CLIENT_ID = process.env.CLIENT_ID || 'wikimedia-producer';

// Configuración de reconexión
const RECONNECT_TIMEOUT = 1000; // 5 segundos

const kafka = new Kafka({
  clientId: CLIENT_ID,
  brokers: KAFKA_BROKERS.split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer();
const url = 'https://stream.wikimedia.org/v2/stream/recentchange';

const run = async () => {
  try {
    console.log(`[${new Date().toISOString()}] Conectando con el broker Kafka: ${KAFKA_BROKERS}`);
    await producer.connect();
    console.log(`[${new Date().toISOString()}] Conectado a Kafka. Publicando en el topic: ${KAFKA_TOPIC}`);

    let messageCount = 0;
    let connectEventSource = () => {
      console.log(`[${new Date().toISOString()}] Conectando al stream de Wikimedia: ${url}`);
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        console.log(`[${new Date().toISOString()}] Conexión establecida con Wikimedia stream`);
      };

      eventSource.onmessage = async (event) => {
        const msg = event.data;
        try {
          const data = JSON.parse(msg);
          // Solo enviamos mensajes que realmente contengan cambios
          if (data.type && data.id) {
            await producer.send({
              topic: KAFKA_TOPIC,
              messages: [{ 
                value: msg,
                // Añadimos key para distribuir mejor entre particiones
                key: data.id.toString()
              }]
            });
            messageCount++;
            
            // Log periódico para no saturar la consola
            if (messageCount % 10 === 0) {
              console.log(`[${new Date().toISOString()}] Publicados ${messageCount} mensajes en "${KAFKA_TOPIC}"`);
            }
          }
        } catch (sendErr) {
          console.error(`[${new Date().toISOString()}] Error al publicar mensaje en Kafka:`, sendErr);
        }
      };

      eventSource.onerror = (err) => {
        console.error(`[${new Date().toISOString()}] Error en el stream de Wikimedia:`, err);
        eventSource.close();
        console.log(`[${new Date().toISOString()}] Reconectando en ${RECONNECT_TIMEOUT}ms...`);
        setTimeout(connectEventSource, RECONNECT_TIMEOUT);
      };

      // Manejador para señales de terminación
      const handleTermination = async () => {
        console.log(`[${new Date().toISOString()}] Recibida señal de terminación, cerrando conexiones...`);
        eventSource.close();
        await producer.disconnect();
        console.log(`[${new Date().toISOString()}] Terminado correctamente.`);
        process.exit(0);
      };

      process.on('SIGTERM', handleTermination);
      process.on('SIGINT', handleTermination);
    };

    // Iniciar la conexión
    connectEventSource();

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error al conectar con Kafka:`, err);
    process.exit(1);
  }
};

run();