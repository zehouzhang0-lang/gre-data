import { useState } from 'react';
import Practice from './Practice';
import { Header, Empty } from './components';
export default function QuestionReview({items,onExit,...props}) {
  const [index,setIndex]=useState(0);
  const target=items[index];
  return <>
    <Header title="题目复习" description={target?`本组 ${index+1} / ${items.length} · 独立重做，提交后再看答案。`:'本组已结束，所有已提交的作答均已保存。'}><button onClick={onExit}>返回今日复习</button></Header>
    {target?<Practice key={target.id} {...props} reviewTarget={target} onReviewNext={()=>setIndex(i=>i+1)}/>:<Empty title="本组已结束"><p>跳过的题仍在待复习中；答错的题将在10分钟后再出现。</p><button className="primary" onClick={onExit}>查看今日剩余任务</button></Empty>}
  </>;
}
