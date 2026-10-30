import { BoneScreen } from '../../components/admin-ui'
import { screenSkeletonCaptureNames, ScreenSkeletonFixture } from '../../components/admin-ui/ScreenSkeletonFixture'
import { ExamSkeletonCaptures } from '../academics/exams/ExamLoadingSkeleton'
import '../academics/exams/exams.css'

/** Dev-only capture surface for generating screen-shaped Boneyard fixtures. */
export function BoneyardCapturePage() {
  if (new URLSearchParams(window.location.search).has('exams')) return <main style={{ padding: '2rem' }}><ExamSkeletonCaptures /></main>
  return <main aria-label="Boneyard skeleton capture" style={{ display: 'grid', gap: '2rem', padding: '2rem' }}>
    {screenSkeletonCaptureNames.map((name) => <BoneScreen key={name} name={name} loading label={`Loading ${name}`} fixture={<ScreenSkeletonFixture name={name} />}><div /></BoneScreen>)}
  </main>
}
