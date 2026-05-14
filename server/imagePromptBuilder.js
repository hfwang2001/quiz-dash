const IMAGE_SIZE = '512*512';

function buildSpritePrompt(subject) {
  return (
    `为2D儿童问答游戏生成一个单体素材，只绘制一个主体对象：${subject}。` +
    '风格必须是等轴测视角像素画，2D game sprite 素材，复古游戏风格。' +
    '主体必须使用粗黑像素边缘描边，干净的像素色块，形体清晰，可直接用于游戏中的独立 sprite。' +
    `最终画面里只能出现一个${subject}，不要出现第二个个体，不要出现第二个物种，也不要出现宿主结构或完整环境。` +
    '如果名称里包含地点、宿主、环境、依附关系或空间关系，只保留核心主体本身，不要把宿主结构、周围场景、地面、树木、树根、珊瑚体、岩石、洞口、叶片或背景环境一起画出来。' +
    '画面中严禁出现两个或两个以上的物种，严禁出现两个或两个以上的主体，严禁出现任何背景装饰、场景边框、地面装饰、植物陪体或环境碎片。' +
    `请把${subject}画成主体孤立、纯白色背景、无背景装饰的等轴测像素风 sprite，并保证画面里只有这一个对象。` +
    '不要在图里绘制任何文字。'
  );
}

export function buildOptionImagePrompt(subject) {
  return {
    positivePrompt: buildSpritePrompt(subject).slice(0, 780),
    negativePromptHint:
      'no text, no watermark, no logo, no UI, no realistic rendering, no blurry pixels, no anti-aliased smooth painting, no duplicate subjects',
    recommendedSize: IMAGE_SIZE
  };
}
