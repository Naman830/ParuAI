import { Shield, Network, Users, Award, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';

const faqs = [
  {
    icon: <Shield className="text-primary size-6" />,
    question: "How secure is our data with ParuAI?",
    answer: "ParuAI is SOC2 Type II compliant and offers end-to-end encryption. For enterprise clients, we offer VPC deployment options and ensure that your data is never used to train our foundational models unless explicitly authorized."
  },
  {
    icon: <Network className="text-primary size-6" />,
    question: "Do you offer custom API access and rate limits?",
    answer: "Yes. Our Enterprise plans include dedicated infrastructure with custom API endpoints and significantly higher rate limits tailored to your specific throughput requirements."
  },
  {
    icon: <Users className="text-primary size-6" />,
    question: "Can we get a dedicated support engineer?",
    answer: "All Enterprise subscriptions come with a dedicated Solutions Architect and a 24/7 priority support channel with guaranteed 1-hour response times."
  },
  {
    icon: <Award className="text-primary size-6" />,
    question: "What custom training options are available?",
    answer: "We support RAG (Retrieval-Augmented Generation) architectures tailored to your internal knowledge bases, fine-tuning on proprietary datasets, and custom agent workflow design."
  }
];

export default function FAQ() {
  return (
    <section className="px-6 py-24 border-t border-border/60">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h3 className="text-3xl font-bold mb-4">Enterprise Questions</h3>
          <p className="text-muted-foreground">Everything you need to know about bringing ParuAI to your organization.</p>
        </div>
        <div className="grid gap-4">
          {faqs.map((faq, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="glass-card rounded-lg overflow-hidden group"
            >
              <details className="group">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none bg-card ">
                  <span className="font-semibold text-lg flex items-center gap-3">
                    {faq.icon}
                    {faq.question}
                  </span>
                  <ChevronDown className="transition-transform group-open:rotate-180 size-5" />
                </summary>
                <div className="px-6 pb-6 text-muted-foreground leading-relaxed border-t border-border pt-4">
                  {faq.answer}
                </div>
              </details>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
