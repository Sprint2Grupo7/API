// importa os bibliotecas necessários
const serialport = require('serialport');
const express = require('express');
const mysql = require('mysql2');

// constantes para configurações
const SERIAL_BAUD_RATE = 9600;
const SERVIDOR_PORTA = 3300;


// habilita ou desabilita a inserção de dados no banco de dados
const HABILITAR_OPERACAO_INSERIR = true;

// função para comunicação serial
const serial = async (
    //valoresSensorAnalogico,
    valoresSensorDigital
) => {

    // conexão com o banco de dados MySQL
    let poolBancoDados = mysql.createPool(
        {
            host: '10.18.32.189',
            user: 'aluno',
            password: 'Sptech#2024',
            database: 'DB_FitAlert',
            port: 3307
        }
    ).promise();

    // lista as portas seriais disponíveis e procura pelo Arduino
    const portas = await serialport.SerialPort.list();
    const portaArduino = portas.find((porta) => porta.vendorId == 2341 && porta.productId == 43);
    if (!portaArduino) {
        throw new Error('O arduino não foi encontrado em nenhuma porta serial');
    }

    // configura a porta serial com o baud rate especificado
    const arduino = new serialport.SerialPort(
        {
            path: portaArduino.path,
            baudRate: SERIAL_BAUD_RATE
        }
    );

    // evento quando a porta serial é aberta
    arduino.on('open', () => {
        console.log(`A leitura do arduino foi iniciada na porta ${portaArduino.path} utilizando Baud Rate de ${SERIAL_BAUD_RATE}`);
        mockarSegundo();
    });

    function mockarSegundo() {
        let inseridoSensor2 = false;
        let idRegistroSensor2 = null;
        let valorMockado = 0;

        setInterval(async () => {
            if (valorMockado === 0 && inseridoSensor2 === false) {
                valorMockado = 1;
                const [result] = await poolBancoDados.execute(
                    'INSERT INTO TB_Registros (fkSensor, ativo) VALUES (2, ?)',
                    [valorMockado]
                );
                idRegistroSensor2 = result.insertId;
                inseridoSensor2 = true;
                console.log("Entrada registrada pelo segundo sensor.");
            } else if (valorMockado === 1 && inseridoSensor2 === true) {
                await poolBancoDados.execute(
                    'UPDATE TB_Registros SET data_saida = NOW() WHERE idRegistro = ?',
                    [idRegistroSensor2]
                );
                inseridoSensor2 = false;
                idRegistroSensor2 = null;
                valorMockado = 0;
                console.log("Saída registrada pelo segundo sensor.");
            }
        }, 10000);

    }
}


let inserido = false;
let idRegistroAtual = null;

// processa os dados recebidos do Arduino
arduino.pipe(new serialport.ReadlineParser({ delimiter: '\r\n' })).on('data', async (data) => {
    console.log(data);
    const valores = data.split(',');
    const sensorDigital = parseInt(valores[0]);
    // const sensorAnalogico = parseFloat(valores[1]);

    // armazena os valores dos sensores nos arrays correspondentes
    //valoresSensorAnalogico.push(sensorAnalogico);
    valoresSensorDigital.push(sensorDigital);

    // insere os dados no banco de dados (se habilitado)
    if (sensorDigital === 1 && inserido === false) {

        // este insert irá inserir os dados na tabela "medida"
        const [result] = await poolBancoDados.execute(
            'INSERT INTO TB_Registros (fkSensor, ativo) VALUES (1, ?)',
            [sensorDigital]
        );
        inserido = true;
        idRegistroAtual = result.insertId;
        console.log("Entrada registrada.");

    }

    if (sensorDigital === 0 && inserido == true) {
        // este update irá atualizar a tabela "registro", registrando a saída da pessoa no provador.
        await poolBancoDados.execute(
            'UPDATE TB_Registros SET data_saida = (NOW()) WHERE idRegistro = ?',
            [idRegistroAtual]
        );
        inserido = false;
        idRegistroAtual = null;
        console.log("Saída registrada");
    }
});

// evento para lidar com erros na comunicação serial
arduino.on('error', (mensagem) => {
    console.error(`Erro no arduino (Mensagem: ${mensagem}`)
});


// função para criar e configurar o servidor web
const servidor = (
    //valoresSensorAnalogico,
    valoresSensorDigital
) => {
    const app = express();

    // configurações de requisição e resposta
    app.use((request, response, next) => {
        response.header('Access-Control-Allow-Origin', '*');
        response.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
        next();
    });

    // inicia o servidor na porta especificada
    app.listen(SERVIDOR_PORTA, () => {
        console.log(`API executada com sucesso na porta ${SERVIDOR_PORTA}`);
    });

    // define os endpoints da API para cada tipo de sensor
    // app.get('/sensores/analogico', (_, response) => {
    //return response.json(valoresSensorAnalogico);});
    app.get('/sensores/digital', (_, response) => {
        return response.json(valoresSensorDigital);
    });
}

// função principal assíncrona para iniciar a comunicação serial e o servidor web
(async () => {
    // arrays para armazenar os valores dos sensores
    //const valoresSensorAnalogico = [];
    const valoresSensorDigital = [];

    // inicia a comunicação serial
    await serial(
        //valoresSensorAnalogico,
        valoresSensorDigital
    );

    // inicia o servidor web
    servidor(
        //valoresSensorAnalogico,
        valoresSensorDigital
    );
})();