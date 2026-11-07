# Criando o arquivo de texto com o passo a passo detalhado da Mob Trap
conteudo = """# GUIA DE CONSTRUÇÃO: MOB TRAP DE ALTA EFICIÊNCIA (ITENS + XP)
Minecraft Java Edition - Foco em Rendimento Máximo e Controle por Redstone

Este manual instrui a construção de uma farm de monstros aérea baseada no sistema de fluxo periódico de água. Mobs nascem no escuro, são empurrados por um timer e caem a uma altura calculada para morrerem com apenas 1 soco, maximizando a coleta de Experiência (XP) e Drops acionados por pilhagem.

---

## 1. INVENTÁRIO COMPLETO DE MATERIAIS

### Blocos Estruturais
* Blocos Sólidos (Pedregulho, Pedra Lisa ou Tijolos): ~1.800 unidades (Aproximadamente 28 pentes/packs de 64). Nota: Não utilize madeira ou blocos inflamáveis devido ao risco de raios.
* Lajes (Slabs de Pedra): ~640 unidades (10 pentes).
* Blocos de Vidro: ~128 unidades (2 pentes).
* Andaimes ou Escadas: ~200 unidades (Para locomoção durante a obra).

### Componentes de Redstone e Mecanismos
* Ejetores (Dispensers): 3 unidades.
* Pistões Grudentos (Sticky Pistons): 2 unidades.
* Comparadores de Redstone: 2 unidades.
* Pós de Redstone: ~32 unidades.
* Tochas de Redstone: 12 unidades.
* Bloco de Redstone: 1 unidade.
* Funis (Hoppers): 6 unidades (4 para a coleta, 2 para o relógio).
* Baús Duplos: 2 a 4 unidades.

### Fluidos e Calibradores
* Baldes de Água: 7 unidades (4 para os canais fixos, 3 para abastecer os ejetores).
* Itens Descartáveis (ex: Terra ou Flechas): 30 unidades (Para o temporizador).

---

## 2. ETAPAS DE CONSTRUÇÃO

### Passo 1: Posicionamento Geográfico e Sala de Matança (Y = 190)
1. Viaje até um bioma de Oceano (de preferência Oceano Profundo) para mitigar o nascimento de monstros em cavernas subterrâneas.
2. Utilizando andaimes, suba verticalmente até a camada Y = 190.
3. Crie uma plataforma de suporte de 5x5 blocos para sua segurança.
4. Coloque dois Baús Duplos no chão. Conecte 4 funis direcionados para os baús, formando um quadrado de 2x2 funis.
5. Posicione Lajes (Slabs) na metade superior do bloco logo acima dos funis. Os monstros ficarão de pé sobre estas lajes. A fresta inferior de meio bloco permitirá que você atinja as pernas dos monstros sem ser detectado ou alvejado por esqueletos.

### Passo 2: O Canal de Queda Livre (Y = 190 a Y = 212)
1. Contorne o quadrado de 2x2 dos funis utilizando blocos sólidos ou vidro, criando a base de uma chaminé vertical.
2. Suba as paredes dessa chaminé por exatamente 22 blocos de altura. 
3. O topo dessa chaminé (o chão do andar de controle) deve terminar exatamente na camada Y = 212. Esta altura garante que os monstros percam quase toda a vida na queda, restando apenas 1 ponto de vida (meio coração).

### Passo 3: Os Canais de Escoamento (Layout em Cruz)
1. A partir da abertura de 2x2 no topo da chaminé (Y=212), estenda uma plataforma de 8 blocos de comprimento por 2 blocos de largura para cada uma das quatro direções cardeais (Norte, Sul, Leste e Oeste).
2. Suba as paredes lateral de esses quatro extensões em 2 blocos de altura. Você terá criado 4 canais secos.
3. Vá até a extremidade final de cada canal (o bloco número 8, mais distante do centro) e coloque dois blocos de água lado a lado.
4. Verificação de Segurança: A água deve escoar em direção ao centro e parar exatamente na borda do buraco de queda, sem derramar para dentro do tubo. Se a água cair no tubo, recompile a contagem: o canal deve ter exatamente 8 blocos de extensão a partir do buraco.

### Passo 4: Plataformas de Spawn e Multiplicação de Andares
1. Preencha as áreas vazias ("quadrantes") localizadas entre os canais de água com blocos sólidos, criando grandes plataformas quadradas de nascimento niveladas com a borda superior dos canais.
2. Primeiro Ejetor: No centro exato do buraco 2x2 da farm, coloque um bloco de apoio centralizado e posicione um Ejetor voltado para cima. Coloque 1 Balde de Água dentro dele.
3. Suba as paredes externas da farm em 3 blocos de altura.
4. No terceiro bloco de altura, construa o Teto do 1º Andar (que funcionará como o chão do 2º Andar). Replique exatamente o mesmo desenho: as plataformas de spawn e os canais (porém, nestes andares superiores, não haverá correntes de água fixas nas bordas, apenas o ejetor central).
5. Coloque o segundo ejetor voltado para cima no centro do 2º andar (com um balde de água dentro).
6. Repita o processo para criar o 3º Andar.

---

## 3. SISTEMA DE AUTOMAÇÃO (REDSTONE)

### Passo 5: O Relógio Temporizador (Etho Hopper Clock)
Monte este circuito na parte externa do teto do último andar da farm:
1. Coloque dois funis diretamente apontados um para o outro (os itens devem ciclar continuamente entre eles).
2. Atrás de cada funil, posicione um Comparador de Redstone com a frente voltada para fora (longe dos funis).
3. Na saída de cada comparador, coloque um Bloco Sólido e, em cima de cada um desses blocos, um Pó de Redstone.
4. Ao lado de cada pó de redstone, posicione um Pistão Grudento voltado para o centro. Os dois pistões devem ficar frente a frente, separados por um espaço de 2 blocos.
5. Coloque um Bloco de Redstone no espaço entre os pistões, fixado a um deles.
6. Calibragem: Insira exatamente 30 itens quaisquer dentro de um dos funis. Os pistões começarão a alternar o bloco de redstone de lado a cada ~12 a 15 segundos.

### Passo 6: A Conexão Vertical (Torre de Tochas)
Para enviar o sinal do relógio simultaneamente para os ejetores de todos os andares sem ocupar espaço lateral:
1. Conecte uma linha de pó de redstone saindo da posição ativa do Bloco de Redstone do Relógio até o topo do ejetor do último andar.
2. Para descer o sinal, crie uma coluna logo ao lado do eixo central dos ejetores utilizando o sistema de inversão:
    * Coloque um Bloco Sólido.
    * Fixe uma Tocha de Redstone na lateral desse bloco.
    * Abaixo da tocha, coloque outro Bloco Sólido (a tocha de cima irá energizá-lo).
    * Fixe outra Tocha de Redstone na lateral desse segundo bloco.
3. Repita a estrutura verticalmente até alcançar o andar mais baixo.
4. Puxe um fio de pó de redstone de cada bloco energizado da coluna diretamente para a lateral de seu respectivo Ejetor.
5. Resultado: Quando o relógio muda de estado, a torre altera a energia global instantaneamente. Os ejetores vão liberar a água (empurrando todos os mobs acumulados para os canais de fluxo) e, no próximo ciclo, recolherão a água (limpando o chão para uma nova rodada de spawn).

---

## 4. ISOLAMENTO E EFICIÊNCIA MÁXIMA

### Passo 7: O Teto Antiluminosidade
1. Acima do último andar de spawn, construa um teto completo de blocos sólidos.
2. Este teto deve se estender horizontalmente por 8 blocos além das paredes externas da farm em todas as direções. Isso cria uma aba de sombra projetada, garantindo nível de luz zero (0) dentro da farm mesmo durante o dia do Minecraft.
3. Cubra toda a superfície superior externa deste teto com Lajes (Slabs) na metade inferior do bloco ou encha o teto de tochas para prevenir o nascimento de monstros sobre a estrutura.

### Passo 8: O Ponto de Espera (AFK Room)
1. A partir do centro do teto iluminado da farm, suba em linha reta por 80 blocos de altura utilizando andaimes ou vidro.
2. Construa uma pequena cabine segura (fechada com vidro para evitar ataques de Phantoms).
3. Por que isso funciona? Permanecer nesta altura limpa a taxa de spawn de qualquer superfície do oceano ou caverna residual que esteja abaixo de Y=190, forçando o algoritmo do jogo a gerar 100% dos monstros do mapa exclusivamente dentro das plataformas escuras da sua Mob Trap. 
"""

with open("Guia_Mob_Trap_Minecraft.txt", "w", encoding="utf-8") as f:
    f.write(conteudo)
print("Arquivo criado com sucesso! O seu download está pronto abaixo:")
X = -225
Y = 190
Z = 85