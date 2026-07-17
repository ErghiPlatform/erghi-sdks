import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Cross-Platform SDKs',
    Svg: require('@site/static/img/feature-sdks.svg').default,
    description: (
      <>
        We provide native SDKs for JavaScript, React, Angular, Python, .NET, Flutter, and Swift.
      </>
    ),
  },
  {
    title: 'Real-Time Messaging',
    Svg: require('@site/static/img/feature-messaging.svg').default,
    description: (
      <>
        Build real-time chat interfaces instantly without managing WebSockets or retry logic.
      </>
    ),
  },
  {
    title: 'AI Native',
    Svg: require('@site/static/img/feature-ai.svg').default,
    description: (
      <>
        Seamlessly hook into Erghi's AI assistants to automate customer support interactions.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
